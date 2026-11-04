import asyncio
from pathlib import Path

import pytest
from support.livekit_probe import FakeSTT, FakeTTS, ProbeAgent
from support.workflow_harness import ScriptedEvaluator, ScriptedResponder

from libretto import Evaluation, ToolRegistry, WorkflowRunner, compile_workflow
from libretto.providers.base import SessionCredentials
from libretto.schema import Speech


def make_voice():
    from libretto.integrations.livekit.agent import WorkflowAgent
    from libretto.integrations.livekit.coordinator import LiveKitCoordinator

    class SyntheticAgent(WorkflowAgent):
        stt_node = ProbeAgent.stt_node
        tts_node = ProbeAgent.tts_node

    compiled = compile_workflow(Path("examples/minimal.yaml").read_text(), tools=ToolRegistry())
    evaluator = ScriptedEvaluator([Evaluation()] * 10)
    runner = WorkflowRunner(
        compiled, responder=ScriptedResponder(["Hello"] * 10), evaluator=evaluator, delivery_mode="external"
    )
    runner._session.defer_actions = True
    controls, audio = [], []
    finished = asyncio.Event()

    async def control(packet):
        controls.append(dict(packet))
        if packet["type"] == "speech_finished":
            finished.set()

    async def send_audio(packet):
        audio.append(packet)

    voice = LiveKitCoordinator(
        Speech(),
        SessionCredentials(),
        runner,
        send_audio,
        control,
        models=(FakeSTT(), FakeTTS()),
        agent_type=SyntheticAgent,
    )
    return voice, runner, evaluator, controls, audio, finished


async def test_real_sdk_adapter_final_input_and_browser_acknowledged_output():
    voice, runner, evaluator, controls, audio, finished = make_voice()

    async def pump():
        async for event in runner.events():
            if event.type == "text_delta":
                await voice.speak_text(event.data["text"], event.epoch, event.data["message_id"])
            elif event.type == "response_done":
                await voice.finish_response()

    await voice.open()
    pump_task = asyncio.create_task(pump())
    try:
        await voice.send_input(b"\0\0" * 160)
        await asyncio.wait_for(finished.wait(), 3)
        assert len(evaluator.contexts) == 1
        assert audio
        packet = next(packet for packet in controls if packet["type"] == "speech_finished")
        speech_id, epoch = packet["speech_id"], packet["epoch"]
        assert not voice.sdk.current_speech.done()
        # Wrong epoch cannot release the SDK output or mark core history delivered.
        await voice.playback_finished(speech_id, epoch=epoch - 1)
        assert not voice.sdk.current_speech.done()
        await voice.playback_finished(speech_id, epoch=epoch)
        await asyncio.wait_for(voice.sdk.current_speech.wait_for_playout(), 3)
        assert runner.snapshot().history[-1].delivered
    finally:
        await voice.close()
        await runner.close()
        await pump_task


async def test_sdk_adapter_interrupts_buffered_output_without_delivery():
    voice, runner, _, controls, _, finished = make_voice()
    await voice.open()
    await runner.start()
    try:
        # A real core-generated literal welcome supplies an actual message binding.
        runner._session.workflow.welcome = "Hello"
        await runner._session.welcome()
        message = runner.snapshot().history[-1]
        await voice.speak_text("Hello", runner._session.epoch, message.id)
        await voice.finish_response()
        await asyncio.wait_for(finished.wait(), 3)
        handle = voice.sdk.current_speech
        await voice.cancel_output()
        await asyncio.wait_for(handle.wait_for_playout(), 3)
        assert handle.interrupted
        assert not runner.snapshot().history[-1].delivered
        assert any(packet["type"] == "speech_interrupted" for packet in controls)
    finally:
        await voice.close()
        await runner.close()


async def test_duplicate_final_turn_id_does_not_replay_after_another_turn():
    from livekit.agents import StopResponse, llm

    from libretto.integrations.livekit.agent import WorkflowAgent

    voice, runner, evaluator, _, _, _ = make_voice()
    agent = WorkflowAgent(voice)
    try:
        for text, turn_id in [("hello", "first"), ("second", "second"), ("hello", "first")]:
            with pytest.raises(StopResponse):
                await agent.on_user_turn_completed(
                    None, llm.ChatMessage(role="user", content=[text], id=turn_id)
                )
            # Drain the real runner until that turn is evaluated before next input.
            if turn_id == "second" or len(evaluator.contexts) == 0:
                from support.workflow_harness import drain_until

                await drain_until(runner, "evaluation")
        assert len(evaluator.contexts) == 2
    finally:
        await runner.close()


async def test_close_before_open_and_repeated_close_do_not_construct_providers():
    voice, runner, _, _, _, _ = make_voice()
    await voice.close()
    await voice.close()
    try:
        from libretto.providers.base import ProviderError

        with pytest.raises(ProviderError, match="closed"):
            await voice.open()
    finally:
        await runner.close()


async def test_guarded_readback_needs_browser_ack_and_fresh_approval_after_interruption():
    from collections import deque

    from livekit.agents import stt
    from test_repair_visit import ROOT, collected, tools

    from libretto.integrations.livekit.agent import WorkflowAgent
    from libretto.integrations.livekit.coordinator import LiveKitCoordinator

    utterances = deque(["book Taylor 7 Test St oven morning", "yes", "repeat", "yes"])

    class SyntheticAgent(WorkflowAgent):
        tts_node = ProbeAgent.tts_node

        async def stt_node(self, audio, model_settings):
            async for _ in audio:
                yield stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
                yield stt.SpeechEvent(
                    type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                    alternatives=[stt.SpeechData(language="en", text=utterances.popleft())],
                )
                yield stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)

    approval = Evaluation(updates={"accepted": {"value": True, "evidence": "yes"}})
    compiled = compile_workflow((ROOT / "agent.yaml").read_text(), tools=tools(), project_root=ROOT)
    runner = WorkflowRunner(
        compiled,
        responder=ScriptedResponder(["Thanks"] * 12),
        evaluator=ScriptedEvaluator([collected(), approval, Evaluation(), approval]),
        delivery_mode="external",
    )
    runner._session.defer_actions = True
    controls = asyncio.Queue()

    async def control(packet):
        await controls.put(dict(packet))

    async def send_audio(packet):
        pass

    voice = LiveKitCoordinator(
        Speech(),
        SessionCredentials(),
        runner,
        send_audio,
        control,
        models=(FakeSTT(), FakeTTS()),
        agent_type=SyntheticAgent,
    )
    runner._session.cancel_output = voice.cancel_output

    async def pump():
        async for event in runner.events():
            if event.type == "text_delta":
                await voice.speak_text(event.data["text"], event.epoch, event.data["message_id"])
            elif event.type == "response_done":
                await voice.finish_response()
            elif event.type == "interrupted" and event.epoch == runner._session.epoch:
                await voice.interrupt()

    async def speech_finished(*, acknowledge=True):
        async with asyncio.timeout(4):
            while True:
                packet = await controls.get()
                if packet["type"] == "speech_finished":
                    if acknowledge:
                        await voice.playback_finished(packet["speech_id"], epoch=packet["epoch"])
                    return packet

    await voice.open()
    pump_task = asyncio.create_task(pump())
    try:
        await voice.send_input(b"\0\0" * 160)
        await speech_finished()  # ordinary reply
        readback = await speech_finished(acknowledge=False)
        assert not runner.snapshot().confirmations["booking"].delivered
        await voice.send_input(b"\0\0" * 160)  # yes while unacknowledged must not book
        await speech_finished()
        fresh = await speech_finished(acknowledge=False)
        assert not runner.snapshot().receipts
        assert fresh["message_id"] != readback["message_id"]
        await voice.cancel_output()
        await voice.send_input(b"\0\0" * 160)  # request a fresh runtime-issued repeat
        await speech_finished()
        await speech_finished()  # complete readback browser ack
        assert runner.snapshot().confirmations["booking"].delivered
        await voice.send_input(b"\0\0" * 160)
        await speech_finished()  # approval reply must drain before action
        async with asyncio.timeout(4):
            while not runner.snapshot().receipts:
                packet = await controls.get()
                if packet["type"] == "speech_finished":
                    await voice.playback_finished(packet["speech_id"], epoch=packet["epoch"])
        assert runner.snapshot().receipts[0]["status"] == "booked"
    finally:
        await voice.close()
        await runner.close()
        await pump_task


async def test_speech_start_invalidates_core_before_final_transcript_arrives():
    from livekit.agents import stt
    from support.workflow_harness import drain_until

    from libretto.integrations.livekit.agent import WorkflowAgent

    release = asyncio.Event()

    class StartOnlyAgent(WorkflowAgent):
        async def stt_node(self, audio, model_settings):
            async for _ in audio:
                yield stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
                await release.wait()

    voice, runner, _, _, _, _ = make_voice()
    voice.agent_type = StartOnlyAgent
    runner._session.cancel_output = voice.cancel_output
    await voice.open()
    try:
        epoch = runner._session.epoch
        await voice.send_input(b"\0\0" * 160)
        await drain_until(runner, "interrupted", timeout=2)
        assert runner._session.epoch > epoch
    finally:
        release.set()
        await voice.close()
        await runner.close()


async def test_late_speech_interruption_cannot_remove_a_new_readback_permit():
    from support.workflow_harness import drain_until
    from test_repair_visit import collected, details, session_for

    session = session_for(
        [collected(), Evaluation(updates={"address": {"value": "8 New St", "evidence": "8 New St"}})]
    )
    session.defer_actions = True
    try:
        await details(session)
        old = session.state.history[-1]
        session.bind_speech("old-output", old.id)
        await session.submit_turn("8 New St", "correction")
        await drain_until(session, "readback")
        await drain_until(session, "response_done")
        fresh = session.state.confirmations["booking"]
        assert fresh.message_id != old.id
        session.reconcile_speech("old-output", "", interrupted=True)
        assert session.state.confirmations["booking"].message_id == fresh.message_id
    finally:
        await session.close()
