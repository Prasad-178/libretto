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


async def test_validated_readback_is_generated_without_another_model_and_requires_playback():
    from libretto.runtime import Session
    from libretto.tools import ToolRegistry

    class CountingSpeaker:
        calls = 0

        async def stream_reply(self, context):
            self.calls += 1
            yield "Thanks for those details."

    speaker = CountingSpeaker()
    evaluator = Evaluator(
        matches=["leave_message"],
        updates={
            "recipient": {"value": "support", "evidence": "support"},
            "caller_name": {"value": "Taylor", "evidence": "Taylor"},
            "callback_number": {"value": "+1 202 555 0142", "evidence": "+1 202 555 0142"},
            "message": {
                "value": "Custom setup and a 3 to 4 month discount",
                "evidence": "Custom setup and a 3 to 4 month discount",
            },
            "message_consent": {"value": True, "evidence": "leave a message"},
        },
    )
    session = Session(
        load_workflow(Path("examples/receptionist.yaml")), speaker, evaluator, Search(), ToolRegistry()
    )
    session.defer_actions = True
    try:
        await session.submit_turn(
            "I want to leave a message for support. Taylor, +1 202 555 0142. Custom setup and a 3 to 4 month discount",
            "details",
        )
        readback = await next_event(session, "readback")
        await next_event(session, "response_done")
        assert session.state.active_stage == "confirm_message"
        assert speaker.calls == 1
        assert not session.state.readback_fingerprint
        message = next(m for m in session.state.history if m.id == readback.data["message_id"])
        assert "Custom setup and a 3 to 4 month discount" in message.generated_content
        assert "support" in message.generated_content
        session.bind_speech("readback-audio", message.id)
        session.playback_finished("readback-audio")
        assert session.state.readback_fingerprint
        assert not session.state.receipts
        evaluator.matches = []
        evaluator.updates = {"message_confirmed": {"value": True, "evidence": "Yes"}}
        await session.submit_turn("Yes", "confirmation")
        done = await next_event(session, "response_done")
        assert not session.state.receipts
        session.bind_speech("ack", done.data["message_id"])
        session.playback_finished("ack")
        receipt = await next_event(session, "tool_result")
        assert receipt.data["status"] == "captured"
        assert receipt.data["data"]["message"] == "Custom setup and a 3 to 4 month discount"
    finally:
        await session.close()


async def test_missing_recipient_cannot_produce_a_validated_readback():
    from libretto.runtime import Session
    from libretto.state import Fact
    from libretto.tools import ToolRegistry

    session = Session(
        load_workflow(Path("examples/receptionist.yaml")), Speaker(), Evaluator(), Search(), ToolRegistry()
    )
    session.state.active_stage = "take_message"
    session.state.facts = {
        k: Fact(v, "answered", str(v), "old")
        for k, v in {
            "caller_name": "Taylor",
            "callback_number": "+1 202 555 0142",
            "message": "Custom setup",
            "message_consent": True,
        }.items()
    }
    try:
        await session.submit_turn("Yes", "next")
        await next_event(session, "response_done")
        assert session.state.active_stage == "take_message"
        assert not session.state.readback_fingerprint
        assert not any(e.type == "readback" for e in session.trace)
        assert not session.state.receipts
    finally:
        await session.close()


async def test_corrected_details_force_new_readback_even_when_semantic_route_is_omitted():
    from libretto.runtime import Session
    from libretto.state import Fact, details_fingerprint
    from libretto.tools import ToolRegistry

    session = Session(
        load_workflow(Path("examples/receptionist.yaml")),
        Speaker(),
        Evaluator(
            updates={
                "message": {"value": "Ask about a 3 to 4 month discount", "evidence": "3 to 4 month discount"}
            }
        ),
        Search(),
        ToolRegistry(),
    )
    values = {
        "recipient": "support",
        "caller_name": "Taylor",
        "callback_number": "+1 202 555 0142",
        "message": "Custom equipment",
        "message_consent": True,
    }
    session.state.active_stage = "confirm_message"
    session.state.facts = {k: Fact(v, "answered", str(v), "old") for k, v in values.items()}
    session.state.readback_fingerprint = details_fingerprint(values)
    try:
        await session.submit_turn("Replace the message with: Ask about a 3 to 4 month discount", "correction")
        event = await next_event(session, "readback")
        await next_event(session, "response_done")
        message = next(m for m in session.state.history if m.id == event.data["message_id"])
        assert "Ask about a 3 to 4 month discount" in message.generated_content
        assert "Custom equipment" not in message.generated_content
        assert not session.state.values().get("message_confirmed")
        assert not session.state.receipts
    finally:
        await session.close()
