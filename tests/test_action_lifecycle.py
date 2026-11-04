import asyncio

from support.workflow_harness import RecordingToolHandler

from libretto.requests import begin_request
from libretto.runtime import Session
from libretto.schema import parse_workflow
from libretto.state import Fact, ToolResult
from libretto.tool_contracts import ParameterSpec, ToolDefinition
from libretto.tools import ToolRegistry

SOURCE = """version: 1
id: action
name: Action
start: collect
shared_prompt: Help
fields:
  address: {type: string}
requests:
  visit: {fields: [address]}
tools: [book_visit]
nodes:
  collect:
    kind: conversation
    begin_request: visit
    edges: [{id: go, to: book, condition: ready}]
  book:
    kind: action
    tool: book_visit
    requires: [address]
    arguments: {address: address}
    edges:
      - {id: booked, to: wrap, result: booked}
      - {id: failed, to: wrap, result: failed}
      - {id: unknown, to: wrap, result: unknown}
  wrap:
    kind: conversation
    edges: [{id: again, to: collect, condition: another}]
"""


def setup(status="booked", *, blocked=False):
    handler = RecordingToolHandler(ToolResult(status=status, data={"receipt": "stub"}), blocked=blocked)
    tools = ToolRegistry()
    tools.register(
        ToolDefinition("book_visit", (ParameterSpec("address", "string"),), ("booked", "failed", "unknown")),
        handler,
    )
    session = Session(parse_workflow(SOURCE), None, None, None, tools)
    return session, handler


async def dispatch(session, address="7 Test St"):
    session.state.active_stage = "collect"
    session.state.facts["address"] = Fact(address, "answered", address, "details")
    session._pending = ("collect", session.workflow.nodes["collect"].edges[0], session.epoch)
    await session._progress()


async def test_identical_requests_have_distinct_action_keys():
    session, handler = setup()
    try:
        await dispatch(session)
        begin_request(session.state, "visit", session.workflow.requests["visit"])
        await dispatch(session)
        assert len(handler.calls) == 2
        assert handler.calls[0][1].idempotency_key != handler.calls[1][1].idempotency_key
        assert len({r["request_id"] for r in session.state.receipts}) == 2
    finally:
        await session.close()


async def test_reentry_does_not_emit_prior_success_as_new_receipt():
    session, handler = setup()
    try:
        await dispatch(session)
        await dispatch(session)
        assert len(handler.calls) == 1
        assert len([e for e in session.trace if e.type == "tool_result"]) == 1
        assert any(e.type == "action_already_completed" for e in session.trace)
    finally:
        await session.close()


async def test_changed_arguments_after_dispatch_require_new_request():
    session, handler = setup()
    try:
        await dispatch(session)
        await dispatch(session, "8 Changed St")
        assert len(handler.calls) == 1
        assert any(
            e.type == "action_blocked" and e.data.get("code") == "action_arguments_changed"
            for e in session.trace
        )
    finally:
        await session.close()


async def test_unknown_outcome_never_auto_retries():
    session, handler = setup("unknown")
    try:
        await dispatch(session)
        await dispatch(session)
        assert len(handler.calls) == 1
        assert len([e for e in session.trace if e.type == "tool_result"]) == 1
        assert session.state.receipts[0]["status"] == "unknown"
    finally:
        await session.close()


async def test_late_callback_after_cancel_cannot_advance_new_request():
    session, handler = setup(blocked=True)
    old_request = session.state.request.id
    task = asyncio.create_task(dispatch(session))
    try:
        await handler.started.wait()
        await session.interrupt()
        begin_request(session.state, "visit", session.workflow.requests["visit"])
        session.state.active_stage = "collect"
        handler.release.set()
        await task
        assert session.state.active_stage == "collect"
        assert session.state.receipts[0]["request_id"] == old_request
        assert len(handler.calls) == 1
    finally:
        handler.release.set()
        await asyncio.gather(task, return_exceptions=True)
        await session.close()


async def test_handler_exception_is_unknown_and_cancellation_is_not_retried():
    class Failing:
        async def __call__(self, arguments, context):
            raise TimeoutError("provider details must stay private")

    session, _ = setup()
    session.tools = ToolRegistry()
    session.tools.register(
        ToolDefinition("book_visit", (ParameterSpec("address", "string"),), ("booked", "failed", "unknown")),
        Failing(),
    )
    try:
        await dispatch(session)
        assert session.state.receipts[0]["status"] == "unknown"
        assert "provider details" not in str(session.state.receipts)
        await dispatch(session)
        assert len(session.state.receipts) == 1
    finally:
        await session.close()


async def test_cancelled_dispatch_retains_unknown_receipt_and_does_not_retry():
    session, handler = setup(blocked=True)
    task = asyncio.create_task(dispatch(session))
    try:
        await handler.started.wait()
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        assert session.state.receipts[0]["status"] == "unknown"
        await dispatch(session)
        assert len(handler.calls) == 1
    finally:
        await session.close()
