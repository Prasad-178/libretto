"""Final-review failures reproduced through public/transport boundaries."""

import asyncio

import pytest
from fastapi.testclient import TestClient
from support.workflow_harness import ScriptedEvaluator, ScriptedResponder, drain_until
from test_action_lifecycle import SOURCE
from test_repair_visit import ROOT, collected, tools

from libretto import (
    Evaluation,
    ParameterSpec,
    ToolDefinition,
    ToolRegistry,
    ToolResult,
    WorkflowCompileError,
    WorkflowRunner,
    compile_workflow,
)
from libretto.providers.base import STTCapabilities, TTSCapabilities, TTSEvent
from libretto.server import create_app
from libretto.speech import SpeechRegistry


def repair(evaluations, *, external=False, source=None):
    compiled = compile_workflow(source or (ROOT / "agent.yaml").read_text(), tools=tools(), project_root=ROOT)
    responder = ScriptedResponder(["Thanks"] * 30)
    return WorkflowRunner(
        compiled,
        responder=responder,
        evaluator=ScriptedEvaluator(evaluations),
        delivery_mode="external" if external else "text",
    ), responder


async def collect(runner, turn="details"):
    await runner.submit("book Taylor 7 Test St oven morning", turn_id=turn)
    readback = await drain_until(runner, "readback")
    await drain_until(runner, "response_done")
    return readback


async def test_cancelled_request_can_restart_through_public_submit():
    approval = Evaluation(updates={"accepted": {"value": True, "evidence": "yes"}})
    runner, _ = repair([collected(), Evaluation(control="cancel_request"), collected(), approval])
    try:
        await collect(runner)
        first_id = runner.snapshot().request.id
        await runner.submit("cancel", turn_id="cancel")
        await drain_until(runner, "interrupted")
        await drain_until(runner, "state")
        await collect(runner, "fresh-details")
        assert runner.snapshot().request and runner.snapshot().request.id != first_id
        await runner.submit("yes", turn_id="approval")
        assert (await drain_until(runner, "tool_result")).data["status"] == "booked"
    finally:
        await runner.close()


async def test_partial_readback_can_be_repeated_then_approved():
    approval = Evaluation(updates={"accepted": {"value": True, "evidence": "yes"}})
    runner, _ = repair([collected(), Evaluation(), approval], external=True)
    try:
        original = await collect(runner)
        await runner.acknowledge_delivery(original.data["message_id"], epoch=original.epoch, completed=False)
        await runner.submit("please repeat the details", turn_id="repeat")
        fresh = await drain_until(runner, "readback")
        await drain_until(runner, "response_done")
        assert fresh.data["message_id"] != original.data["message_id"]
        assert not runner.snapshot().receipts
        await runner.acknowledge_delivery(fresh.data["message_id"], epoch=fresh.epoch, completed=True)
        await runner.submit("yes", turn_id="approval")
        assert (await drain_until(runner, "tool_result")).data["status"] == "booked"
    finally:
        await runner.close()


async def test_explicitly_waived_delivery_allows_external_approval():
    source = (
        (ROOT / "agent.yaml")
        .read_text()
        .replace("    request: visit", "    require_delivery: false\n    request: visit")
    )
    runner, _ = repair(
        [collected(), Evaluation(updates={"accepted": {"value": True, "evidence": "yes"}})],
        external=True,
        source=source,
    )
    try:
        await collect(runner)
        await runner.submit("yes", turn_id="approval")
        assert (await drain_until(runner, "tool_result")).data["status"] == "booked"
    finally:
        await runner.close()


@pytest.mark.parametrize("kind", ["say", "end", "action"])
async def test_nonconversation_start_enters_runtime_node(kind):
    source = (
        SOURCE.replace("start: collect", "start: book")
        if kind == "action"
        else """version: 1
id: start
name: Start
start: entry
shared_prompt: Help
nodes:
  entry: {kind: end}
"""
    )
    registry = ToolRegistry()
    if kind == "say":
        source = source.replace(
            "  entry: {kind: end}",
            "  entry: {kind: say, text: Hello, edges: [{id: done, to: end}]}\n  end: {kind: end}",
        )
    if kind == "action":
        # A no-argument application action can be a start node; no request is implied.
        source = source.replace("    requires: [address]", "    requires: []").replace(
            "    arguments: {address: address}", "    arguments: {}"
        )

        # Retain reachable collection by the wrap -> collect route.
        async def handler(arguments, context):
            return ToolResult(status="booked")

        registry.register(ToolDefinition("book_visit", (), ("booked", "failed", "unknown")), handler)
    runner = WorkflowRunner(
        compile_workflow(source, tools=registry),
        responder=ScriptedResponder([]),
        evaluator=ScriptedEvaluator([]),
    )
    try:
        await runner.start()
        if kind == "action":
            assert (await drain_until(runner, "tool_result")).data["status"] == "booked"
        else:
            async with asyncio.timeout(1):
                events = [e async for e in runner.events()]
            assert any(e.type == "ended" for e in events)
            if kind == "say":
                assert any(e.type == "text_delta" and e.data["text"] == "Hello" for e in events)
    finally:
        await runner.close()


def test_confirmation_entry_cannot_start_a_different_request():
    source = (
        (ROOT / "agent.yaml")
        .read_text()
        .replace("requests:\n", "requests:\n  other: {fields: []}\n")
        .replace("  confirm:\n", "  confirm:\n    begin_request: other\n")
    )
    with pytest.raises(WorkflowCompileError) as error:
        compile_workflow(source, tools=tools(), project_root=ROOT)
    assert error.value.issues[0].path == ("nodes", "confirm", "begin_request")


async def late_action_runner(*, entry_only=False):
    entered, release, cancelled = asyncio.Event(), asyncio.Event(), asyncio.Event()
    contexts = []

    async def handler(arguments, context):
        contexts.append(context)
        entered.set()
        while not release.is_set():
            try:
                await release.wait()
            except asyncio.CancelledError:
                cancelled.set()
        return ToolResult(status="booked", data={"receipt": "old-request-booking"})

    registry = ToolRegistry()
    registry.register(
        ToolDefinition("book_visit", (ParameterSpec("address", "string"),), ("booked", "failed", "unknown")),
        handler,
    )
    source = SOURCE.replace(
        "    begin_request: visit", "    begin_request: visit\n    entry: respond"
    ).replace(
        "    edges: [{id: go, to: book, condition: ready}]",
        "    edges: [{id: go, to: book, condition: ready}, {id: restart, to: collect, condition: another}]",
    )
    details = Evaluation(updates={"address": {"value": "7 Test", "evidence": "7 Test"}}, matches=["go"])
    evaluator = ScriptedEvaluator(
        [
            details,
            Evaluation(control="cancel_request"),
            Evaluation(matches=["restart"]) if entry_only else details,
        ]
    )
    responder = ScriptedResponder(["Checking"] * 20)
    runner = WorkflowRunner(
        compile_workflow(source, tools=registry), responder=responder, evaluator=evaluator
    )
    await runner.start()
    await drain_until(runner, "response_done")
    await runner.submit("7 Test", turn_id="first")
    await asyncio.wait_for(entered.wait(), 1)
    await drain_until(runner, "tool_started")
    await runner.submit("cancel", turn_id="cancel")
    await asyncio.wait_for(cancelled.wait(), 1)
    await drain_until(runner, "evaluation")
    await drain_until(runner, "state")
    return runner, responder, release, contexts


async def test_cancel_resistant_action_does_not_strand_pending_entry():
    runner, _, release, contexts = await late_action_runner()
    try:
        await runner.submit("7 Test", turn_id="fresh-details")
        await drain_until(runner, "evaluation")
        await drain_until(runner, "response_done")
        # Current work progresses even before the historical callback returns.
        await drain_until(runner, "tool_started")
        assert len(contexts) == 2
        release.set()
        first = await drain_until(runner, "tool_result")
        second = await drain_until(runner, "tool_result")
        assert first.data["request_id"] != second.data["request_id"]
    finally:
        release.set()
        await runner.close()


async def test_late_receipt_is_not_actual_result_for_new_entry_response():
    runner, responder, release, _ = await late_action_runner(entry_only=True)
    try:
        release.set()
        await drain_until(runner, "tool_result")
        await runner.submit("another", turn_id="new-entry")
        await drain_until(runner, "transition")
        # The ordinary turn response precedes the entry response.
        await drain_until(runner, "response_done")
        assert responder.contexts[-1].turn_id == "entry"
        assert "ACTUAL TOOL RECEIPT" not in responder.contexts[-1].system
        assert runner.snapshot().receipts[0]["data"]["receipt"] == "old-request-booking"
    finally:
        release.set()
        await runner.close()


class Recognition:
    capabilities = STTCapabilities()

    def __init__(self, *args, **kwargs):
        pass

    async def open(self):
        pass

    async def close(self):
        pass

    async def cancel_output(self, *args):
        pass


class Synthesis:
    async def interrupt(self, *args):
        pass

    capabilities = TTSCapabilities(streaming_text=True, cancellation=True)

    def __init__(self, credentials, config, emit, **kwargs):
        self.emit = emit

    async def open(self, **kwargs):
        pass

    async def close(self):
        pass

    async def cancel_output(self, *args):
        pass

    async def speak_text(self, text, epoch, message_id):
        self.epoch, self.speech_id = epoch, "speech-" + message_id
        await self.emit(TTSEvent("started", epoch=epoch, speech_id=self.speech_id, message_id=message_id))

    async def finish_response(self):
        await self.emit(TTSEvent("finished", epoch=self.epoch, speech_id=self.speech_id))


def test_websocket_wrong_epoch_cannot_acknowledge_readback(tmp_path):
    source = (
        (ROOT / "agent.yaml")
        .read_text()
        .replace("knowledge: {policies: knowledge}", "knowledge: {}")
        .replace("common_knowledge: [policies]", "common_knowledge: []")
    )
    source += "\nspeech:\n  engine: direct\n  credential_mode: providers\n  stt: {provider: deepgram, model: flux-general-en}\n  tts: {provider: deepgram, model: flux-haley-en}\n"
    path = tmp_path / "agent.yaml"
    path.write_text(source)
    sessions = []

    class Registry(SpeechRegistry):
        def create(self, config, credentials, session, *args):
            sessions.append(session)
            return super().create(config, credentials, session, *args)

    speech = Registry(
        stt={"deepgram": Recognition}, tts={"deepgram": Synthesis}, credentials={"deepgram": "openrouter"}
    )

    class Model:
        async def evaluate(self, context):
            return collected()

        async def stream_reply(self, context):
            yield "Thanks"

        async def close(self):
            pass

    with TestClient(
        create_app(
            load_environment=False,
            workflow_path=path,
            project_root=tmp_path,
            tool_factory=tools,
            speech_registry=speech,
            model_factory=lambda *args, **kwargs: Model(),
        )
    ) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json({"type": "start", "mode": "voice", "openrouter_key": "fake"})
            while ws.receive_json()["type"] != "ready":
                pass
            ws.send_json({"type": "text", "text": "book Taylor 7 Test St oven morning", "turn_id": "details"})
            speech_id = ""
            epoch = None
            while True:
                packet = ws.receive_json()
                if packet["type"] == "speech_finished" and "booking" in sessions[0].state.confirmations:
                    permit = sessions[0].state.confirmations["booking"]
                    if packet["data"]["speech_id"] == "speech-" + permit.message_id:
                        speech_id, epoch = packet["data"]["speech_id"], packet["data"]["epoch"]
                        break
            ws.send_json({"type": "playback", "speech_id": speech_id, "epoch": epoch - 1, "drained": True})
            ws.send_json({"type": "export"})
            while ws.receive_json()["type"] != "export":
                pass
            assert not sessions[0].state.confirmations["booking"].delivered
            # Correct delivery remains usable after the rejected packet.
            ws.send_json({"type": "playback", "speech_id": speech_id, "epoch": epoch, "drained": True})
            ws.send_json({"type": "export"})
            while ws.receive_json()["type"] != "export":
                pass
            assert sessions[0].state.confirmations["booking"].delivered
            ws.send_json({"type": "close"})
