from pathlib import Path

import pytest
from support.workflow_harness import ScriptedEvaluator, ScriptedResponder, drain_until

from libretto.requests import begin_request
from libretto.runtime import Session
from libretto.schema import RequestSpec, load_workflow, parse_workflow
from libretto.state import Evaluation, Fact, SessionState

SOURCE = """version: 1
id: repair
name: Repair
start: collect
shared_prompt: Help
fields:
  address: {type: string}
  profile: {type: string}
requests:
  visit: {fields: [address]}
nodes:
  collect:
    kind: conversation
    begin_request: visit
    edges: [{id: next, to: correction, condition: next}]
  correction:
    kind: conversation
    edges: [{id: again, to: collect, condition: new request}]
"""


class Search:
    def search(self, *args, **kwargs):
        return []


def test_new_request_retains_session_facts_but_clears_request_permissions():
    state = SessionState("collect")
    state.facts = {
        key: Fact(value, "answered", value, "old")
        for key, value in [("address", "7 Old St"), ("profile", "Taylor")]
    }
    state.readback_fingerprint = "old"
    state.receipts = [{"request_id": "old", "status": "booked"}]
    old = begin_request(state, "visit", RequestSpec(fields=["address"]))
    new = begin_request(state, "visit", RequestSpec(fields=["address"]))
    assert new.id != old.id
    assert old.status == "cancelled"
    assert state.values() == {"profile": "Taylor"}
    assert state.readback_fingerprint is None
    assert state.receipts == [{"request_id": "old", "status": "booked"}]


async def test_correction_stage_keeps_request_id_and_explicit_reentry_starts_new_request():
    session = Session(
        parse_workflow(SOURCE),
        ScriptedResponder(["First", "Second"]),
        ScriptedEvaluator([Evaluation(matches=["next"]), Evaluation(matches=["again"])]),
        Search(),
        None,
    )
    first = session.state.request.id
    try:
        await session.submit_turn("next", "t1")
        await drain_until(session, "transition")
        assert session.state.active_stage == "correction"
        assert session.state.request.id == first
        await session.submit_turn("new request", "t2")
        await drain_until(session, "transition")
        assert session.state.active_stage == "collect"
        assert session.state.request.id != first
    finally:
        await session.close()


def test_start_node_begins_request_once():
    session = Session(parse_workflow(SOURCE), None, None, Search(), None)
    identity = session.state.request.id
    assert session.snapshot().request_id == identity
    assert session.snapshot().request_id == identity


@pytest.mark.parametrize(
    "source,match",
    [
        (SOURCE.replace("begin_request: visit", "begin_request: missing"), "Unknown request"),
        (SOURCE.replace("fields: [address]", "fields: [missing]"), "Unknown request field"),
        (
            SOURCE.replace(
                "  visit: {fields: [address]}", "  visit: {fields: [address]}\n  other: {fields: [address]}"
            ),
            "multiple request",
        ),
    ],
)
def test_invalid_request_references(source, match):
    with pytest.raises(ValueError, match=match):
        parse_workflow(source)


def test_tiny_survey_still_has_no_explicit_request_scope():
    assert load_workflow(Path("examples/minimal.yaml")).requests == {}


async def test_cancellation_rejects_old_pending_transition():
    session = Session(
        parse_workflow(SOURCE),
        ScriptedResponder(["First"]),
        ScriptedEvaluator([Evaluation(control="cancel_request")]),
        Search(),
        None,
    )
    original = session.state.request
    try:
        await session.submit_turn("cancel", "t1")
        await drain_until(session, "evaluation")
        await drain_until(session, "interrupted")
        assert original.status == "cancelled"
        assert session.state.pending_stage is None
        assert session.state.request is None
    finally:
        await session.close()


async def test_late_evaluator_cannot_update_another_request_in_same_epoch():
    evaluator = ScriptedEvaluator(
        [Evaluation(updates={"address": {"value": "old", "evidence": "old"}})], blocked=True
    )
    session = Session(parse_workflow(SOURCE), ScriptedResponder(["Hello"]), evaluator, Search(), None)
    try:
        await session.submit_turn("old", "t1")
        await evaluator.started.wait()
        begin_request(session.state, "visit", session.workflow.requests["visit"])
        evaluator.release.set()
        import asyncio

        await asyncio.gather(*tuple(session._tasks))
        assert "address" not in session.state.values()
        assert not any(event.type == "evaluation" for event in session.trace)
    finally:
        await session.close()
