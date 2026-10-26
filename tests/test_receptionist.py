from pathlib import Path

from test_runtime import Evaluator, Search, Speaker, next_event

from libretto.schema import load_workflow


async def test_transfer_failure_offers_message_instead_of_claiming_success():
    from libretto.runtime import Session
    from libretto.state import Fact
    from libretto.tools import ToolRegistry

    flow = load_workflow(Path("examples/receptionist.yaml"))
    evaluator = Evaluator(updates={"destination_confirmed": {"value": True, "evidence": "Yes"}})
    session = Session(flow, Speaker(), evaluator, Search(), ToolRegistry())
    session.state.active_stage = "confirm_transfer"
    session.state.facts["recipient"] = Fact("billing", "answered", "billing", "previous")
    try:
        await session.submit_turn("Yes.", "approval")
        result = await next_event(session, "tool_result")
        assert result.data["status"] == "unavailable"
        await next_event(session, "transition")
        assert session.state.active_stage == "offer_message"
        assert not session.state.values().get("message_consent")
    finally:
        await session.close()


async def test_complete_details_skip_to_confirmation_without_an_extra_user_turn():
    from libretto.runtime import Session
    from libretto.tools import ToolRegistry

    evaluator = Evaluator(
        matches=["leave_message"],
        updates={
            "recipient": {"value": "billing", "evidence": "billing"},
            "caller_name": {"value": "Sam", "evidence": "Sam"},
            "callback_number": {"value": "5550100", "evidence": "5550100"},
            "message": {"value": "Please call tomorrow", "evidence": "Please call tomorrow"},
            "message_consent": {"value": True, "evidence": "leave a message"},
        },
    )
    session = Session(
        load_workflow(Path("examples/receptionist.yaml")), Speaker(), evaluator, Search(), ToolRegistry()
    )
    try:
        await session.submit_turn(
            "I want to leave a message for billing. Sam, 5550100. Please call tomorrow", "details"
        )
        await next_event(session, "evaluation")
        await next_event(session, "response_done")
        assert session.state.active_stage == "confirm_message"
        assert not session.state.receipts
    finally:
        await session.close()


async def test_mock_capture_requires_current_confirmed_readback():
    from libretto.state import Fact, SessionState, details_fingerprint
    from libretto.tools import ToolRegistry

    state = SessionState("save_message")
    values = {
        "recipient": "billing",
        "caller_name": "Sam",
        "callback_number": "5550100",
        "message": "Please call",
        "message_consent": True,
        "message_confirmed": True,
    }
    state.facts = {k: Fact(v, "answered", str(v), "t1") for k, v in values.items()}
    tools = ToolRegistry()
    args = {k: values[k] for k in ("recipient", "caller_name", "callback_number", "message")}
    assert (await tools.execute("capture_message", args, state, "key")).status == "failed"
    state.readback_fingerprint = details_fingerprint(values)
    result = await tools.execute("capture_message", args, state, "key")
    assert result.status == "captured"
    assert result.data["session_only"] is True
    assert result.data["receipt"]
    assert (await tools.execute("capture_message", args, state, "key")).data["receipt"] == result.data[
        "receipt"
    ]


async def test_cancel_request_preserves_history_but_clears_task():
    from libretto.runtime import Session
    from libretto.state import Evaluation, Fact
    from libretto.tools import ToolRegistry

    class Cancel:
        async def evaluate(self, context):
            return Evaluation(control="cancel_request")

    session = Session(
        load_workflow(Path("examples/receptionist.yaml")), Speaker(), Cancel(), Search(), ToolRegistry()
    )
    session.state.active_stage = "take_message"
    session.state.facts["message"] = Fact("Old request", "answered", "Old request", "old")
    try:
        await session.submit_turn("Cancel that request", "cancel")
        await next_event(session, "state")
        assert session.state.active_stage == "identify"
        assert session.state.values() == {}
        assert session.state.history[0].content == "Cancel that request"
    finally:
        await session.close()


async def test_faq_side_question_keeps_message_task_and_uses_real_sources():
    from libretto.retrieval import RetrievalIndex
    from libretto.runtime import Session
    from libretto.state import Fact
    from libretto.tools import ToolRegistry

    class Answer:
        async def stream_reply(self, context):
            assert any("closed" in p.text.lower() for p in context.passages)
            yield "Support is closed on weekends. What message would you like to leave?"

    session = Session(
        load_workflow(Path("examples/receptionist.yaml")),
        Answer(),
        Evaluator(),
        RetrievalIndex.from_directory(Path("examples/knowledge")),
        ToolRegistry(),
    )
    session.state.active_stage = "take_message"
    session.state.facts["caller_name"] = Fact("Sam", "answered", "Sam", "previous")
    try:
        await session.submit_turn("Is support open on weekends?", "faq")
        await next_event(session, "response_done")
        assert session.state.active_stage == "take_message"
        assert session.state.values()["caller_name"] == "Sam"
    finally:
        await session.close()


async def test_a_later_confirmation_of_an_existing_readback_can_capture():
    from libretto.runtime import Session
    from libretto.state import Fact, Message, details_fingerprint
    from libretto.tools import ToolRegistry

    session = Session(
        load_workflow(Path("examples/receptionist.yaml")),
        Speaker(),
        Evaluator(updates={"message_confirmed": {"value": True, "evidence": "Yes"}}),
        Search(),
        ToolRegistry(),
    )
    session.state.active_stage = "confirm_message"
    values = {
        "recipient": "billing",
        "caller_name": "Sam",
        "callback_number": "5550100",
        "message": "Please call",
        "message_consent": True,
    }
    session.state.facts = {k: Fact(v, "answered", str(v), "old") for k, v in values.items()}
    session.state.history = [Message("assistant", "billing Sam 5550100 Please call. Correct?", "old")]
    session.state.readback_fingerprint = details_fingerprint(values)
    try:
        await session.submit_turn("Yes.", "approval")
        assert (await next_event(session, "tool_result")).data["status"] == "captured"
        assert len(session.state.receipts) == 1
    finally:
        await session.close()
