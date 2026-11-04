import asyncio
from pathlib import Path

import pytest
from support.workflow_harness import (
    RecordingToolHandler,
    ScriptedEvaluator,
    ScriptedResponder,
    drain_until,
)

from libretto.runtime import Session
from libretto.schema import load_workflow
from libretto.state import Evaluation, ToolResult


class EmptySearch:
    def search(self, *args, **kwargs):
        return []


async def test_blocked_evaluation_keeps_response_and_state_separate():
    evaluator = ScriptedEvaluator([Evaluation(matches=["answered"])], blocked=True)
    session = Session(
        load_workflow(Path("examples/minimal.yaml")),
        ScriptedResponder(["Hello"]),
        evaluator,
        EmptySearch(),
        None,
    )
    try:
        await session.submit_turn("An answer", "t1")
        await evaluator.started.wait()
        event = await drain_until(session, "text_delta")
        assert event.data["text"] == "Hello"
        assert session.state.active_stage == "question"
        evaluator.release.set()
        await drain_until(session, "ended")
        assert session.state.active_stage == "end"
    finally:
        await session.close()


async def test_recording_handler_can_hold_real_dispatch_boundary():
    handler = RecordingToolHandler(ToolResult(status="booked"), blocked=True)
    task = asyncio.create_task(handler({"address": "7 Test St"}, "request-a"))
    try:
        await handler.started.wait()
        assert not task.done()
        assert handler.calls == [({"address": "7 Test St"}, "request-a")]
        handler.release.set()
        assert (await task).status == "booked"
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


async def test_event_drain_reports_bounded_stall():
    session = Session(
        load_workflow(Path("examples/minimal.yaml")),
        ScriptedResponder(["Hello"]),
        ScriptedEvaluator([Evaluation()]),
        EmptySearch(),
        None,
    )
    try:
        await session.emit("first")
        await session.emit("second")
        with pytest.raises(AssertionError, match="first.*second"):
            await drain_until(session, "never", limit=2)
        with pytest.raises(AssertionError, match="Timed out"):
            await drain_until(session, "never", timeout=0.01)
    finally:
        await session.close()
