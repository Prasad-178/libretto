import asyncio
from pathlib import Path

from libretto.schema import load_workflow


class Speaker:
    async def stream_reply(self, context):
        yield "A useful answer."


class Search:
    def search(self, query, sources, limit=3):
        return []


class Tools:
    async def execute(self, name, arguments, state, key):
        from libretto.state import ToolResult

        return ToolResult(status="captured", data={"receipt": "demo-1"})


def make_session(evaluator, *, clock=None, speaker=None, flow=None):
    from libretto.runtime import Session

    return Session(
        flow or load_workflow(Path("examples/minimal.yaml")),
        speaker or Speaker(),
        evaluator,
        Search(),
        Tools(),
        **({"clock": clock} if clock else {}),
    )


async def next_event(session, kind):
    async with asyncio.timeout(1):
        async for event in session.events():
            if event.type == kind:
                return event


class Evaluator:
    def __init__(self, *, block=False, updates=None, matches=None):
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        if not block:
            self.release.set()
        self.updates, self.matches = updates or {}, matches or []

    async def evaluate(self, context):
        from libretto.state import Evaluation

        self.started.set()
        await self.release.wait()
        return Evaluation(updates=self.updates, matches=self.matches)


async def test_blocked_evaluator_does_not_delay_first_speaking_text():
    evaluator = Evaluator(block=True)
    session = make_session(evaluator)
    try:
        await session.submit_turn("I like clear explanations.", "t1")
        await evaluator.started.wait()
        event = await next_event(session, "text_delta")
        assert event.data["text"] == "A useful answer."
        assert not evaluator.release.is_set()
    finally:
        await session.close()


async def test_pending_transition_commits_at_response_boundary():
    class PausedSpeaker:
        def __init__(self):
            self.release = asyncio.Event()

        async def stream_reply(self, context):
            yield "Thanks."
            await self.release.wait()

    speaker = PausedSpeaker()
    evaluator = Evaluator(matches=["answered"])
    session = make_session(evaluator, speaker=speaker)
    try:
        await session.submit_turn("Clarity.", "t1")
        await next_event(session, "evaluation")
        assert session.state.active_stage == "question"
        assert session.state.pending_stage == "end"
        speaker.release.set()
        await next_event(session, "ended")
        assert session.state.active_stage == "end"
    finally:
        await session.close()


async def test_late_evaluator_cannot_overwrite_a_newer_turn():
    class StubbornEvaluator:
        def __init__(self):
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def evaluate(self, context):
            from libretto.state import Evaluation

            if context.turn_id == "old":
                self.started.set()
                try:
                    await self.release.wait()
                except asyncio.CancelledError:
                    await self.release.wait()
                return Evaluation(updates={"answer": {"value": "old", "evidence": "old"}})
            return Evaluation(updates={"answer": {"value": "new", "evidence": "new"}})

    evaluator = StubbornEvaluator()
    session = make_session(evaluator)
    try:
        await session.submit_turn("old", "old")
        await evaluator.started.wait()
        await session.submit_turn("new", "new")
        await next_event(session, "evaluation")
        evaluator.release.set()
        await asyncio.sleep(0)
        assert session.state.values()["answer"] == "new"
    finally:
        evaluator.release.set()
        await session.close()


async def test_speculative_text_stays_buffered_until_matching_confirmation():
    session = make_session(Evaluator())
    try:
        await session.submit_turn("Clarity.", "t1", speculative=True)
        await next_event(session, "draft_ready")
        assert not any(e.type == "text_delta" for e in session.trace)
        await session.confirm_turn("Clarity.", "t1")
        assert (await next_event(session, "text_delta")).data["text"] == "A useful answer."
    finally:
        await session.close()


async def test_changed_transcript_discards_speculative_answer():
    session = make_session(Evaluator())
    try:
        await session.submit_turn("Old words", "t1", speculative=True)
        await next_event(session, "draft_ready")
        await session.confirm_turn("Different final words", "t1")
        await next_event(session, "response_done")
        assert session.state.history[0].content == "Different final words"
        assert len([e for e in session.trace if e.type == "text_delta"]) == 1
    finally:
        await session.close()


async def test_session_expires_at_180_seconds():
    now = [0.0]
    session = make_session(Evaluator(), clock=lambda: now[0])
    now[0] = 180.0
    await session.submit_turn("Hello", "late")
    assert (await next_event(session, "expired")).type == "expired"
    assert not session.state.history
    await session.close()


async def test_unknown_fact_proposal_cannot_mutate_state():
    session = make_session(Evaluator(updates={"unconfigured": {"value": "bad", "evidence": "bad"}}))
    try:
        await session.submit_turn("bad", "t1")
        await next_event(session, "evaluation_error")
        assert session.state.values() == {}
    finally:
        await session.close()


async def test_interrupt_prevents_action_waiting_for_playback():
    flow = load_workflow(Path("examples/receptionist.yaml"))
    evaluator = Evaluator(
        updates={
            "recipient": {"value": "billing", "evidence": "billing"},
            "destination_confirmed": {"value": True, "evidence": "connect"},
        }
    )
    session = make_session(evaluator, flow=flow)
    session.state.active_stage = "confirm_transfer"
    session.defer_actions = True
    try:
        await session.submit_turn("Please connect billing.", "t1")
        await next_event(session, "response_done")
        assert any(e.type == "evaluation" for e in session.trace)
        await session.interrupt()
        session.playback_finished()
        await asyncio.sleep(0)
        assert session.state.receipts == []
    finally:
        await session.close()


async def test_correction_cannot_reuse_readback_from_an_earlier_turn():
    from libretto.state import Fact, Message, details_fingerprint

    flow = load_workflow(Path("examples/receptionist.yaml"))
    session = make_session(
        Evaluator(
            updates={
                "message": {"value": "Please call", "evidence": "Please call"},
                "message_confirmed": {"value": True, "evidence": "yes"},
            }
        ),
        flow=flow,
    )
    session.state.active_stage = "confirm_message"
    details = {
        "recipient": "billing",
        "caller_name": "Sam",
        "callback_number": "5550100",
        "message": "Please call tomorrow",
        "message_consent": True,
    }
    session.state.facts = {k: Fact(v, "answered", str(v), "old") for k, v in details.items()}
    session.state.history = [
        Message("assistant", "billing Sam 5550100 Please call tomorrow. Correct?", "old")
    ]
    session.state.readback_fingerprint = details_fingerprint(details)
    try:
        await session.submit_turn("Change it to Please call, yes.", "new")
        await next_event(session, "evaluation")
        assert not session.state.values().get("message_confirmed")
        assert session.state.receipts == []
    finally:
        await session.close()
