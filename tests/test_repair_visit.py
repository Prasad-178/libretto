import importlib.util
from pathlib import Path

import pytest
from support.workflow_harness import ScriptedEvaluator, ScriptedResponder, drain_until

from libretto.compiler import compile_workflow
from libretto.runtime import Session
from libretto.state import Evaluation

ROOT = Path("examples/repair_visit")


def tools(outcome="booked"):
    spec = importlib.util.spec_from_file_location("repair_tools", ROOT / "tools.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.create_tools(outcome=outcome)


def collected():
    return Evaluation(
        updates={
            key: {"value": value, "evidence": str(value) if not isinstance(value, bool) else "book"}
            for key, value in dict(
                customer_name="Taylor", address="7 Test St", issue="oven", window="morning", consent=True
            ).items()
        }
    )


def session_for(evaluations, outcome="booked"):
    compiled = compile_workflow((ROOT / "agent.yaml").read_text(), tools=tools(outcome), project_root=ROOT)
    return Session(
        compiled.workflow,
        ScriptedResponder(["Thanks"] * 10),
        ScriptedEvaluator(evaluations),
        compiled.index,
        compiled.tools,
    )


async def details(session):
    await session.submit_turn("book Taylor 7 Test St oven morning", "details")
    await drain_until(session, "readback")
    await drain_until(session, "response_done")
    assert not session.state.receipts


@pytest.mark.parametrize("outcome", ["booked", "failed", "unknown"])
async def test_repair_visit_uses_registered_tool_and_actual_outcome(outcome):
    session = session_for(
        [collected(), Evaluation(updates={"accepted": {"value": True, "evidence": "yes"}})], outcome
    )
    try:
        await details(session)
        await session.submit_turn("yes", "approval")
        result = await drain_until(session, "tool_result")
        assert result.data["status"] == outcome
        assert result.data["data"]["address"] == "7 Test St"
        assert result.data["data"]["receipt"] == "repair-1"
    finally:
        await session.close()


async def test_corrected_address_requires_new_readback_before_booking():
    session = session_for(
        [
            collected(),
            Evaluation(
                updates={
                    "address": {"value": "8 New St", "evidence": "8 New St"},
                    "accepted": {"value": True, "evidence": "yes"},
                }
            ),
            Evaluation(updates={"accepted": {"value": True, "evidence": "yes"}}),
        ]
    )
    try:
        await details(session)
        await session.submit_turn("8 New St yes", "correction")
        await drain_until(session, "readback")
        await drain_until(session, "response_done")
        assert not session.state.receipts
        assert "8 New St" in session.state.history[-1].generated_content
        await session.submit_turn("yes", "approval")
        result = await drain_until(session, "tool_result")
        assert result.data["data"]["address"] == "8 New St"
    finally:
        await session.close()


async def test_refusal_does_not_book():
    session = session_for([collected(), Evaluation(
        updates={'accepted': {'value': False, 'evidence': 'no'}}, matches=['refused'])])
    try:
        await details(session)
        await session.submit_turn('no', 'refusal')
        await drain_until(session, 'transition')
        assert not session.state.receipts
        assert 'booking' not in session.state.confirmations
    finally:
        await session.close()


async def test_interrupted_repair_readback_cannot_authorize_booking():
    session = session_for([collected(), Evaluation(updates={
        'accepted': {'value': True, 'evidence': 'yes'}})])
    session.defer_actions = True
    try:
        await details(session)
        message = session.state.history[-1]
        session.bind_speech('repair-readback', message.id)
        session.reconcile_speech('repair-readback', 'Visit for Taylor', interrupted=True)
        await session.submit_turn('yes', 'approval')
        await drain_until(session, 'evaluation')
        assert not session.state.receipts
        assert session.state.values().get('accepted') is not True
    finally:
        await session.close()


async def test_repeated_identical_visits_need_fresh_approval_and_receipts():
    approval=Evaluation(updates={'accepted': {'value': True, 'evidence': 'yes'}})
    session=session_for([collected(), approval, Evaluation(matches=['another']), collected(), approval])
    try:
        await details(session)
        await session.submit_turn('yes','approval-1')
        first=await drain_until(session,'tool_result')
        await drain_until(session,'response_done')
        await session.submit_turn('another visit','another')
        await drain_until(session,'transition')
        assert session.state.values().get('accepted') is None
        await session.submit_turn('book Taylor 7 Test St oven morning','details-2')
        await drain_until(session,'readback')
        await drain_until(session,'response_done')
        assert len(session.state.receipts)==1
        await session.submit_turn('yes','approval-2')
        second=await drain_until(session,'tool_result')
        assert first.data['request_id'] != second.data['request_id']
        assert first.data['data']['receipt'] != second.data['data']['receipt']
    finally:
        await session.close()
