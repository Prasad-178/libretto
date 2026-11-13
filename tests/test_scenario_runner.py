"""Offline scenarios exercise the public runner, never live application tools."""

from pathlib import Path

import pytest
import yaml

from libretto.testing import Scenario, load_scenario, run_scenario

REPAIR = Path("examples/repair_visit").resolve()


def repair_scenario(*, delivered=True, approval=True):
    steps = [
        {
            "kind": "turn",
            "id": "details",
            "text": "book Taylor 7 Test St oven morning",
            "evaluation": {
                "updates": {
                    key: {"value": value, "evidence": evidence}
                    for key, value, evidence in [
                        ("customer_name", "Taylor", "Taylor"),
                        ("address", "7 Test St", "7 Test St"),
                        ("issue", "oven", "oven"),
                        ("window", "morning", "morning"),
                        ("consent", True, "book"),
                    ]
                }
            },
        },
        {"kind": "expect", "stage": "confirm", "action_count": 0, "request": "visit"},
        {"kind": "deliver", "policy": "booking", "completed": delivered},
    ]
    if approval:
        steps += [
            {
                "kind": "turn",
                "id": "approval",
                "text": "yes",
                "evaluation": {"updates": {"accepted": {"value": True, "evidence": "yes"}}},
            },
            {"kind": "expect", "action_count": 1 if delivered else 0},
        ]
    return {
        "version": 1,
        "name": "Repair",
        "workflow": str(REPAIR / "agent.yaml"),
        "tools": {
            "book_visit": {
                "parameters": dict.fromkeys(["customer_name", "address", "issue", "window"], "string"),
                "results": ["booked", "failed", "unknown"],
                "responses": [{"status": "booked", "data": {"simulated": True}}],
            }
        },
        "steps": steps,
    }


async def run(data, **kwargs):
    return await run_scenario(Scenario.model_validate(data), base_dir=Path.cwd(), **kwargs)


async def test_repair_scenario_dispatches_real_runtime_action_only_after_delivery_and_approval():
    report = await run(repair_scenario())
    assert report.passed, report.failures
    assert report.stages == ["collect", "confirm", "book", "wrap"]
    assert report.actions[0]["arguments"]["address"] == "7 Test St"
    assert report.actions[0]["status"] == "booked"
    assert report.actions[0]["request"] == "request-1"
    assert len(report.actions[0]["argument_fingerprint"]) == 64
    assert report.facts["accepted"] is True


async def test_partial_readback_cannot_authorize_action_and_reports_runtime_reason():
    report = await run(repair_scenario(delivered=False))
    assert report.passed, report.failures
    assert report.actions == []
    assert "missing_readback" in report.codes
    assert "accepted" not in report.facts


async def test_wrong_expectation_reports_step_and_actual_state():
    data = repair_scenario(approval=False)
    data["steps"].append({"kind": "expect", "action_count": 1, "facts": {"address": "Wrong"}})
    report = await run(data)
    assert not report.passed
    assert any("step 4" in failure and "action_count" in failure for failure in report.failures)
    assert any("address" in failure and "7 Test St" in failure for failure in report.failures)


async def test_reports_are_stable_across_runs_without_random_request_ids_or_time():
    assert (await run(repair_scenario())).model_dump() == (await run(repair_scenario())).model_dump()


async def test_missing_simulated_response_fails_even_when_runtime_returns_unknown():
    data = repair_scenario()
    data["tools"]["book_visit"]["responses"] = []
    report = await run(data)
    assert not report.passed
    assert any("No scripted result for book_visit" in f for f in report.failures)


async def test_evaluator_rejection_is_failure_not_silent_scenario_success():
    data = repair_scenario(approval=False)
    data["steps"] = [data["steps"][0]]
    data["steps"][0]["evaluation"]["updates"]["address"]["evidence"] = "not in utterance"
    report = await run(data)
    assert not report.passed
    assert "invalid_evidence" in report.codes


async def test_interruption_requires_new_readback_and_later_approval():
    data = repair_scenario()
    data["steps"][2] = {"kind": "interrupt"}
    data["steps"][-1] = {"kind": "expect", "action_count": 0}
    data["steps"] += [
        {"kind": "deliver", "policy": "booking"},
        {
            "kind": "turn",
            "id": "fresh-approval",
            "text": "yes",
            "evaluation": {"updates": {"accepted": {"value": True, "evidence": "yes"}}},
        },
        {"kind": "expect", "action_count": 1},
    ]
    report = await run(data)
    assert report.passed, report.failures


async def test_controlled_clock_triggers_existing_session_expiry_without_sleep():
    data = repair_scenario(approval=False)
    data["steps"] = [{"kind": "advance", "seconds": 300}, data["steps"][0]]
    report = await run(data)
    assert report.completed
    assert "expired" in report.codes


@pytest.mark.parametrize(
    "change",
    [
        {"version": 2},
        {"credentials": {"openrouter": "not-a-real-key"}},
        {"steps": []},
        {"steps": [{"kind": "advance", "seconds": -1}]},
        {"steps": [{"kind": "turn", "id": "x", "text": " ", "evaluation": {}}]},
    ],
)
def test_invalid_scenario_inputs_are_setup_errors(change):
    data = repair_scenario()
    data.update(change)
    with pytest.raises(ValueError):
        Scenario.model_validate(data)


@pytest.mark.parametrize(
    "text",
    [
        "version: 1\nversion: 1",
        "x: &x [*x]",
        '{"version": 1, "version": 2}',
        "[" * 30 + "0" + "]" * 30,
        "x" * 100_001,
    ],
)
def test_scenario_loader_rejects_ambiguous_or_unbounded_input(tmp_path, text):
    path = tmp_path / "invalid.yaml"
    path.write_text(text)
    with pytest.raises(ValueError):
        load_scenario(path)


def test_scenario_loader_resolves_a_regular_yaml_file(tmp_path):
    path = tmp_path / "repair.yaml"
    path.write_text(yaml.safe_dump(repair_scenario()))
    assert load_scenario(path).name == "Repair"


async def test_repeated_requests_have_distinct_report_identities_and_independent_approval():
    data = repair_scenario()
    data["tools"]["book_visit"]["responses"] *= 2
    data["steps"] += [
        {"kind": "turn", "id": "another", "text": "another visit", "evaluation": {"matches": ["another"]}},
        {"kind": "expect", "stage": "collect", "action_count": 1, "absent_facts": ["accepted", "address"]},
    ]
    again = repair_scenario()["steps"]
    again[0]["id"] = "second-details"
    again[1]["action_count"] = 1
    again[3]["id"] = "second-approval"
    again[4]["action_count"] = 2
    data["steps"] += again
    report = await run(data)
    assert report.passed, report.failures
    assert [item["request"] for item in report.actions] == ["request-1", "request-2"]


async def test_missing_facts_and_refusal_never_dispatch_a_simulated_tool():
    data = repair_scenario()
    data["steps"] = [
        {
            "kind": "turn",
            "id": "incomplete",
            "text": "Taylor",
            "evaluation": {"updates": {"customer_name": {"value": "Taylor", "evidence": "Taylor"}}},
        },
        {"kind": "expect", "stage": "collect", "action_count": 0, "absent_facts": ["accepted"]},
        {"kind": "turn", "id": "refusal", "text": "No visit", "evaluation": {"matches": ["refused"]}},
        {"kind": "expect", "stage": "wrap", "action_count": 0},
    ]
    report = await run(data)
    assert report.passed, report.failures
    assert report.actions == []


async def test_failed_and_unknown_simulated_results_follow_their_actual_routes():
    for status in ["failed", "unknown"]:
        data = repair_scenario()
        data["tools"]["book_visit"]["responses"] = [{"status": status}]
        data["steps"][-1]["action_results"] = [status]
        report = await run(data)
        assert report.passed, report.failures
        assert report.actions[0]["status"] == status


async def test_stalled_inference_has_a_bounded_failure_and_cleans_up(monkeypatch):
    import asyncio

    from libretto.testing.runner import _Inference

    async def stalled(self, context):
        await asyncio.Future()

    before = set(asyncio.all_tasks())
    monkeypatch.setattr(_Inference, "evaluate", stalled)
    report = await run(repair_scenario(), timeout=0.02)
    assert not report.passed
    assert any("runtime stalled" in failure for failure in report.failures)
    assert set(asyncio.all_tasks()) <= before


@pytest.mark.parametrize(
    "change",
    [
        {"steps": [{"kind": "turn", "id": "same", "text": "a", "evaluation": {}}] * 2},
        {"tools": {"book_visit": {"results": ["booked", "booked"]}}},
        {"tools": {"book_visit": {"results": ["booked"], "responses": [{"status": "other"}]}}},
        {"steps": [{"kind": "expect"}]},
    ],
)
def test_invalid_scripts_fail_before_running(change):
    data = repair_scenario()
    data.update(change)
    with pytest.raises(ValueError):
        Scenario.model_validate(data)


async def test_event_budget_failure_still_drains_and_closes_runtime(monkeypatch):
    import asyncio

    from libretto.testing.runner import _Inference

    async def many_chunks(self, context):
        for _ in range(4000):
            yield "x"

    monkeypatch.setattr(_Inference, "stream_reply", many_chunks)
    data = repair_scenario()
    data["steps"] = [{"kind": "turn", "id": str(i), "text": "hello", "evaluation": {}} for i in range(2)]
    async with asyncio.timeout(1):
        report = await run(data, timeout=0.1)
    assert not report.passed
    assert any("5,000 events" in failure for failure in report.failures)


@pytest.mark.parametrize("text", ["? [one, two]\n: value", "version: true\n"])
def test_malformed_mapping_and_boolean_version_have_setup_diagnostics(tmp_path, text):
    path = tmp_path / "bad.yaml"
    path.write_text(text)
    with pytest.raises(ValueError):
        load_scenario(path)


async def test_scenario_can_assert_action_arguments_and_distinct_request_count():
    data = repair_scenario()
    data["steps"][-1].update(
        {
            "action_arguments": [{"address": "Wrong"}],
            "request_count": 2,
        }
    )
    report = await run(data)
    assert not report.passed
    assert any("action_arguments" in failure and "7 Test St" in failure for failure in report.failures)
    assert any("request_count" in failure for failure in report.failures)


async def test_retrieved_passage_identity_assertions_use_actual_retriever():
    data = repair_scenario(approval=False)
    data["expected_passages"] = ["nonexistent-passage"]
    report = await run(data)
    assert not report.passed
    assert report.passages
    assert any("nonexistent-passage" in failure for failure in report.failures)
