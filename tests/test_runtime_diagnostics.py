"""Concrete runtime vetoes carry inspectable, non-sensitive explanations."""

import pytest
import yaml
from support.workflow_harness import ScriptedEvaluator, ScriptedResponder
from test_action_lifecycle import SOURCE
from test_compiler import registry
from test_repair_visit import ROOT, tools

from libretto import WorkflowRunner, compile_workflow
from libretto.state import Evaluation


async def recorded(compiled, evaluations, turns):
    import asyncio

    runner = WorkflowRunner(
        compiled,
        responder=ScriptedResponder(["Thanks"] * 10),
        evaluator=ScriptedEvaluator(evaluations),
        delivery_mode="external",
    )
    events = []

    async def collect():
        async for event in runner.events():
            events.append(event)

    pump = asyncio.create_task(collect())
    try:
        for index, text in enumerate(turns):
            await runner.submit(text, turn_id=str(index))
            await runner.wait_idle()
    finally:
        await runner.close()
        await pump
    return events, runner.snapshot()


async def test_missing_required_facts_identifies_fields_and_incoming_route_without_values():
    compiled = compile_workflow(SOURCE, tools=registry()[0])
    events, state = await recorded(compiled, [Evaluation(matches=["go"])], ["ready"])
    blocked = next(event.data for event in events if event.type == "action_blocked")
    assert blocked["code"] == "missing_facts"
    assert blocked["missing_fields"] == ["address"]
    assert blocked["node"] == "book"
    assert blocked["source"] == "collect"
    assert blocked["edge"] == "go"
    assert state.receipts == []


@pytest.mark.parametrize(
    "flag,expected", [("consent", "missing_consent"), ("accepted", "missing_acceptance")]
)
async def test_confirmation_flags_have_specific_missing_reason_without_dispatch(flag, expected):
    source = yaml.safe_load((ROOT / "agent.yaml").read_text())
    source["nodes"]["collect"]["edges"] = [{"id": "attempt", "to": "book", "condition": "Try the action"}]
    source["nodes"]["collect"]["edges"].append({"id": "confirm", "to": "confirm", "condition": "Read back"})
    values = dict(
        customer_name="Taylor", address="PRIVATE_ADDRESS", issue="oven", window="morning", consent=True
    )
    if flag == "consent":
        values.pop("consent")
        source["nodes"]["book"]["requires"].remove("accepted")
    evaluation = Evaluation(
        updates={
            key: {"value": value, "evidence": str(value) if type(value) is str else "book"}
            for key, value in values.items()
        },
        matches=["attempt"],
    )
    compiled = compile_workflow(yaml.safe_dump(source), tools=tools(), project_root=ROOT)
    events, state = await recorded(compiled, [evaluation], ["book Taylor PRIVATE_ADDRESS oven morning"])
    blocked = next(event.data for event in events if event.type == "action_blocked")
    assert blocked["code"] == expected
    assert flag in blocked["missing_fields"]
    assert blocked["policy"] == "booking"
    assert "PRIVATE_ADDRESS" not in str(blocked)
    assert state.receipts == []


async def test_rejected_evaluation_has_step_and_request_reference():
    compiled = compile_workflow(SOURCE, tools=registry()[0])
    events, _ = await recorded(
        compiled, [Evaluation(updates={"address": {"value": "Private", "evidence": "absent"}})], ["hello"]
    )
    rejected = next(event.data for event in events if event.type == "evaluation_error")
    assert rejected["code"] == "invalid_evidence"
    assert rejected["node"] == "collect"
    assert rejected["request_id"]
    assert "Private" not in str(rejected)


async def test_incomplete_readback_explains_exact_missing_fields():
    source = yaml.safe_load((ROOT / "agent.yaml").read_text())
    source["nodes"]["collect"]["edges"][0] = {"id": "premature", "to": "confirm", "condition": "Read now"}
    compiled = compile_workflow(yaml.safe_dump(source), tools=tools(), project_root=ROOT)
    events, state = await recorded(compiled, [Evaluation(matches=["premature"])], ["Read now"])
    blocked = next(event.data for event in events if event.type == "readback_blocked")
    assert blocked["code"] == "missing_readback_facts"
    assert blocked["node"] == "confirm"
    assert blocked["policy"] == "booking"
    assert set(blocked["missing_fields"]) == {"customer_name", "address", "issue", "window"}
    assert state.receipts == []


@pytest.mark.parametrize(
    "case,expected",
    [
        ("no-request", "missing_request"),
        ("wrong-request", "request_mismatch"),
        ("no-permit", "missing_readback"),
        ("partial", "undelivered_readback"),
        ("stale", "stale_confirmation"),
        ("unapproved", "missing_acceptance"),
        ("no-consent", "missing_consent"),
    ],
)
def test_confirmation_veto_classifier_names_the_actual_failure(case, expected):
    from dataclasses import replace

    from libretto.confirmation import ConfirmationState
    from libretto.diagnostics import action_block_details
    from libretto.schema import load_workflow
    from libretto.state import Fact, RequestState, SessionState

    workflow = load_workflow(ROOT / "agent.yaml")
    state = SessionState("confirm", request=RequestState("one", "visit"))
    state.facts["consent"] = Fact(True, "answered", "book", "details")
    permit = ConfirmationState(
        "booking", "one", "current", "message", 1, delivered=True, accepted_turn_id="yes"
    )
    state.confirmations["booking"] = permit
    if case == "no-request":
        state.request = None
    elif case == "wrong-request":
        state.confirmations["booking"] = replace(permit, request_id="other")
    elif case == "no-permit":
        state.confirmations.clear()
    elif case == "partial":
        state.confirmations["booking"] = replace(permit, delivered=False)
    elif case == "stale":
        state.confirmations["booking"] = replace(permit, fingerprint="old")
    elif case == "unapproved":
        state.confirmations["booking"] = replace(permit, accepted_turn_id=None)
    elif case == "no-consent":
        state.facts["consent"] = Fact(False, "answered", "no", "refusal")
    details = action_block_details(workflow.nodes["book"], workflow, state, missing=[], fingerprint="current")
    assert details["code"] == expected
    assert "current" not in details.values() and "old" not in details.values()


async def test_withdrawn_consent_is_explained_before_requesting_another_approval():
    source = yaml.safe_load((ROOT / "agent.yaml").read_text())
    source["nodes"]["collect"]["edges"].append({"id": "attempt", "to": "book", "condition": "Try"})
    values = dict(customer_name="Taylor", address="7 Test St", issue="oven", window="morning", consent=False)
    evaluation = Evaluation(
        updates={
            key: {"value": value, "evidence": value if type(value) is str else "no"}
            for key, value in values.items()
        },
        matches=["attempt"],
    )
    events, state = await recorded(
        compile_workflow(yaml.safe_dump(source), tools=tools(), project_root=ROOT),
        [evaluation],
        ["no Taylor 7 Test St oven morning"],
    )
    blocked = next(event.data for event in events if event.type == "action_blocked")
    assert blocked["code"] == "missing_consent"
    assert "consent" in blocked["missing_fields"]
    assert state.receipts == []
