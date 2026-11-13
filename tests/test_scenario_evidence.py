"""Saved evidence is projected and redacted before any output boundary."""

import json
from pathlib import Path

from test_scenario_runner import repair_scenario

from libretto.testing import Scenario, run_scenario


async def run(data):
    return await run_scenario(Scenario.model_validate(data), base_dir=Path.cwd())


async def test_evidence_has_workflow_and_runtime_provenance_without_raw_dialogue():
    report = await run(repair_scenario())
    assert report.context.workflow_sha256
    assert len(report.context.workflow_sha256) == 64
    assert report.context.workflow_id == "repair-visit"
    assert report.context.yaml_schema_version == 1
    assert report.context.mode == "scripted"
    assert report.context.libretto_version
    assert report.context.models["speaker"]
    assert report.context.speech["engine"]
    assert any(
        event.type == "transition" and event.details["destination"] == "book" for event in report.timeline
    )
    text = report.model_dump_json()
    assert "book Taylor 7 Test St oven morning" not in text
    assert "Scripted response." not in text
    assert "Are these details correct?" not in text
    assert all("at" not in event.model_dump() for event in report.timeline)
    assert all("idempotency_key" not in event.details for event in report.timeline)


async def test_sensitive_values_are_removed_from_all_report_and_event_surfaces():
    data = repair_scenario()
    data["sensitive_fields"] = ["address", "customer_name"]
    data["name"] = "Taylor run"
    data["steps"][-1]["facts"] = {"address": "Private expected address"}
    data["steps"][-1]["action_arguments"] = [{"address": "Wrong secret"}]
    report = await run(data)
    assert not report.passed
    text = report.model_dump_json()
    for secret in ["Taylor", "7 Test St", "Private expected address", "Wrong secret"]:
        assert secret not in text
    assert report.facts["address"] == "[redacted]"
    assert report.actions[0]["arguments"]["address"] == "[redacted]"
    assert report.actions[0]["argument_fingerprint"] == "[redacted]"
    assert report.context.redacted_fields == ["address", "customer_name"]
    assert "[redacted]" in text


async def test_boolean_sensitive_field_is_redacted_by_identity_without_changing_pass_status():
    data = repair_scenario()
    data["sensitive_fields"] = ["consent"]
    report = await run(data)
    assert report.passed
    assert report.facts["consent"] == "[redacted]"
    states = [event.details for event in report.timeline if event.type == "state"]
    assert all(state.get("facts", {}).get("consent") in (None, "[redacted]") for state in states)


async def test_unknown_sensitive_field_fails_setup_instead_of_silently_leaking():
    import pytest

    data = repair_scenario()
    data["sensitive_fields"] = ["adress"]
    with pytest.raises(ValueError, match="sensitive"):
        await run(data)


async def test_redaction_covers_escaped_sensitive_values_in_failure_dictionaries():
    data = repair_scenario()
    secret = "O'Brien\nPrivate"
    data["sensitive_fields"] = ["address"]
    data["steps"][0]["text"] = f"book Taylor {secret} oven morning"
    data["steps"][0]["evaluation"]["updates"]["address"] = {"value": secret, "evidence": secret}
    data["steps"][-1]["action_arguments"] = [{"address": "Different"}]
    report = await run(data)
    text = report.model_dump_json()
    assert "O'Brien" not in text
    assert "Private" not in text
    assert "Different" not in text
    assert "[redacted]" in text


async def test_sensitive_redaction_does_not_modify_scenario_or_runtime_assertions():
    data = repair_scenario()
    data["sensitive_fields"] = ["address"]
    data["steps"][-1]["facts"] = {"address": "7 Test St"}
    before = json.dumps(data, sort_keys=True)
    report = await run(data)
    assert report.passed
    assert json.dumps(data, sort_keys=True) == before
