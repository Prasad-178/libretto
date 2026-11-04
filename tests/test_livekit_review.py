"""Final-review failures at the real SDK/transport boundary."""

import asyncio
from pathlib import Path

import pytest
from livekit.agents import APIError, tts
from support.livekit_probe import FakeSTT
from support.workflow_harness import ScriptedEvaluator, ScriptedResponder
from test_livekit_adapter import make_voice
from test_repair_visit import ROOT, tools

from libretto import ToolRegistry, WorkflowRunner, compile_workflow
from libretto.integrations.livekit.coordinator import LiveKitCoordinator
from libretto.providers.base import SessionCredentials
from libretto.schema import Speech
from libretto.state import Fact


class BrokenStream(tts.SynthesizeStream):
    async def _run(self, output_emitter):
        async for event in self._input_ch:
            if isinstance(event, str):
                output_emitter.initialize(
                    request_id="broken-readback",
                    sample_rate=24000,
                    num_channels=1,
                    mime_type="audio/pcm",
                    frame_size_ms=10,
                    stream=True,
                )
                output_emitter.start_segment(segment_id="partial")
                output_emitter.push(b"\0\0" * 240)
                output_emitter.end_segment()
                await self._tts.partial_captured.wait()
                raise APIError("Synthetic failure after partial audio", retryable=False)


class BrokenTTS(tts.TTS):
    def __init__(self):
        super().__init__(capabilities=tts.TTSCapabilities(streaming=True), sample_rate=24000, num_channels=1)
        self.partial_captured = asyncio.Event()

    def synthesize(self, *args, **kwargs):
        raise AssertionError("No network inference")

    def stream(self, *, conn_options):
        return BrokenStream(tts=self, conn_options=conn_options)


async def test_partial_default_sdk_tts_failure_cannot_deliver_full_readback():
    from libretto.integrations.livekit.agent import WorkflowAgent

    compiled = compile_workflow((ROOT / "agent.yaml").read_text(), tools=tools(), project_root=ROOT)
    runner = WorkflowRunner(
        compiled, responder=ScriptedResponder([]), evaluator=ScriptedEvaluator([]), delivery_mode="external"
    )
    runner._session.defer_actions = True
    # Issue a genuine runtime readback with current request identity.
    core = runner._session
    core.state.active_stage = "confirm"
    for name, value in {
        "customer_name": "Taylor",
        "address": "7 Test St",
        "issue": "oven",
        "window": "morning",
        "consent": True,
    }.items():
        core.state.facts[name] = Fact(value, "answered", str(value), "details")
    await core._entry_response(core.epoch)
    message = core.state.history[-1]
    controls = asyncio.Queue()

    async def control(packet):
        await controls.put(dict(packet))

    broken = BrokenTTS()

    async def send_audio(packet):
        broken.partial_captured.set()

    voice = LiveKitCoordinator(
        Speech(),
        SessionCredentials(),
        runner,
        send_audio,
        control,
        models=(FakeSTT(), broken),
        agent_type=WorkflowAgent,
    )
    await voice.open()
    try:
        await voice.speak_text(message.generated_content, core.epoch, message.id)
        await voice.finish_response()
        async with asyncio.timeout(4):
            while True:
                packet = await controls.get()
                if packet["type"] in {"speech_finished", "speech_interrupted"}:
                    speech_id = packet["speech_id"]
                    # A real browser can acknowledge only the partial audio it received.
                    await voice.playback_finished(speech_id, epoch=core.epoch)
                    break
        assert (
            not core.state.confirmations.get("booking") or not core.state.confirmations["booking"].delivered
        )
        assert not message.delivered
        assert message.content != message.generated_content
    finally:
        await voice.close()
        await runner.close()


@pytest.mark.parametrize("operation", ["chunk", "finish"])
@pytest.mark.parametrize("shutdown", ["interrupt", "close"])
async def test_interrupt_releases_pending_text_producers_and_pump_recovers(operation, shutdown):
    voice, runner, _, _, _, finished = make_voice()
    await voice.open()
    await runner.start()
    runner._session.workflow.welcome = "Welcome"
    await runner._session.welcome()
    welcome = runner.snapshot().history[-1]
    await voice.speak_text("Welcome", runner._session.epoch, welcome.id)
    await voice.finish_response()
    await asyncio.wait_for(finished.wait(), 3)
    # Queue another response behind unacknowledged welcome, then fill its text queue.
    await voice.speak_text("queued", runner._session.epoch, "queued-message")
    binding = voice.writing
    for _ in range(binding.text.maxsize - 1):
        binding.text.put_nowait("queued")
    marker = asyncio.Event()
    entered = asyncio.Event()

    async def pump():
        entered.set()
        if operation == "chunk":
            await voice.speak_text("blocked", runner._session.epoch, "queued-message")
        else:
            await voice.finish_response()
        marker.set()

    producer = asyncio.create_task(pump())
    try:
        await entered.wait()
        assert not marker.is_set()
        if shutdown == "interrupt":
            await voice.cancel_output()
        else:
            await voice.close()
        await asyncio.wait_for(marker.wait(), 1)
        await producer
        assert binding.interrupted
        if shutdown == "interrupt":
            # The same connection must produce and drain a fresh reply.
            finished.clear()
            await runner._session.welcome()
            fresh = runner.snapshot().history[-1]
            await voice.speak_text("Recovered", runner._session.epoch, fresh.id)
            await voice.finish_response()
            await asyncio.wait_for(finished.wait(), 3)
            recovered = next(item for item in voice.bindings.values() if item.message_id == fresh.id)
            await voice.playback_finished(recovered.speech_id, epoch=recovered.epoch)
            await asyncio.wait_for(recovered.handle.wait_for_playout(), 3)
            assert not recovered.handle.interrupted
    finally:
        producer.cancel()
        await asyncio.gather(producer, return_exceptions=True)
        await voice.close()
        await runner.close()


def test_text_delivery_runner_is_rejected_by_voice_adapter():
    compiled = compile_workflow(Path("examples/minimal.yaml").read_text(), tools=ToolRegistry())
    runner = WorkflowRunner(compiled, responder=ScriptedResponder([]), evaluator=ScriptedEvaluator([]))
    with pytest.raises(ValueError, match="external"):
        LiveKitCoordinator(Speech(), SessionCredentials(), runner, None, None)
