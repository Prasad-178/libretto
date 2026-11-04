import subprocess
import sys

import pytest
from support.workflow_harness import ScriptedEvaluator, ScriptedResponder, drain_until
from test_action_lifecycle import SOURCE
from test_compiler import registry
from test_repair_visit import ROOT, collected, tools

from libretto import WorkflowRunner, compile_workflow
from libretto.confirmation import ConfirmationBlocked
from libretto.state import Evaluation


def runner(**kwargs):
    compiled = compile_workflow(SOURCE, tools=registry()[0])
    return WorkflowRunner(
        compiled,
        responder=ScriptedResponder(["hello"] * 8),
        evaluator=ScriptedEvaluator([Evaluation()] * 8),
        **kwargs,
    )


def test_core_import_does_not_import_server_or_livekit():
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys,libretto; assert not any(k.startswith(('fastapi','livekit','libretto.server','libretto.speech')) for k in sys.modules)",
        ],
        check=True,
    )


async def test_runner_uses_detached_compiled_snapshot():
    compiled = compile_workflow(SOURCE, tools=registry()[0])
    instance = WorkflowRunner(compiled, responder=ScriptedResponder([]), evaluator=ScriptedEvaluator([]))
    compiled.workflow.start = "changed"
    compiled.workflow.nodes.clear()
    compiled.index.passages.clear()
    try:
        await instance.start()
        assert instance.snapshot().active_stage == "collect"
        assert instance.snapshot().request.name == "visit"
    finally:
        await instance.close()


async def test_snapshot_mutation_does_not_change_session():
    instance = runner()
    try:
        snapshot = instance.snapshot()
        snapshot.active_stage = "changed"
        snapshot.request.name = "changed"
        snapshot.receipts.append({"fake": True})
        assert instance.snapshot().active_stage == "collect"
        assert instance.snapshot().request.name == "visit"
        assert instance.snapshot().receipts == []
    finally:
        await instance.close()


async def test_duplicate_turn_and_close_are_idempotent():
    instance = runner()
    await instance.start()
    await instance.start()
    await instance.submit("hello", turn_id="one")
    await drain_until(instance, "response_done")
    await instance.submit("hello", turn_id="one")
    assert len([m for m in instance.snapshot().history if m.role == "user"]) == 1
    await instance.close()
    await instance.close()
    remaining = [event async for event in instance.events()]
    assert not any(event.type == "tool_started" for event in remaining)


async def test_event_stream_finishes_on_close():
    instance = runner()
    await instance.close()
    assert [event async for event in instance.events()] == []


async def test_external_delivery_mode_rejects_stale_ack():
    compiled = compile_workflow((ROOT / "agent.yaml").read_text(), tools=tools(), project_root=ROOT)
    instance = WorkflowRunner(
        compiled,
        responder=ScriptedResponder(["Thanks"] * 8),
        evaluator=ScriptedEvaluator(
            [collected(), Evaluation(updates={"accepted": {"value": True, "evidence": "yes"}})]
        ),
        delivery_mode="external",
    )
    try:
        await instance.submit("book Taylor 7 Test St oven morning", turn_id="details")
        readback = await drain_until(instance, "readback")
        await drain_until(instance, "response_done")
        assert not instance.snapshot().confirmations["booking"].delivered
        with pytest.raises(ConfirmationBlocked):
            await instance.acknowledge_delivery(
                readback.data["message_id"], epoch=readback.epoch - 1, completed=True
            )
        await instance.acknowledge_delivery(readback.data["message_id"], epoch=readback.epoch, completed=True)
        assert instance.snapshot().confirmations["booking"].delivered
        await instance.submit("yes", turn_id="approval")
        assert (await drain_until(instance, "tool_result")).data["status"] == "booked"
    finally:
        await instance.close()
