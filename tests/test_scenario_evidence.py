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


async def test_sensitive_argument_hashes_are_redacted_from_assertion_failures_too():
    import hashlib

    data = repair_scenario()
    data["sensitive_fields"] = ["address"]
    data["steps"][-1]["argument_fingerprints"] = ["WRONG_FINGERPRINT"]
    report = await run(data)
    actual_hash = hashlib.sha256(
        json.dumps(
            {
                "customer_name": "Taylor",
                "address": "7 Test St",
                "issue": "oven",
                "window": "morning",
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()
    assert not report.passed
    assert actual_hash not in report.model_dump_json()
    assert "WRONG_FINGERPRINT" not in report.model_dump_json()


async def test_author_can_fix_yaml_then_save_evidence_explaining_the_changed_path(tmp_path):
    import shutil

    import yaml
    from test_scenario_runner import REPAIR

    shutil.copytree(REPAIR, tmp_path / "repair")
    workflow_path = tmp_path / "repair/agent.yaml"
    original = workflow_path.read_text()
    data = repair_scenario()
    data["workflow"] = str(workflow_path)
    workflow = yaml.safe_load(original)
    workflow["nodes"]["collect"]["edges"][0]["predicate"]["conditions"][-1]["value"] = False
    workflow_path.write_text(yaml.safe_dump(workflow))
    failed = await run(data)
    assert not failed.passed
    assert failed.stages == ["collect"]
    assert any("stage" in failure or "readback" in failure for failure in failed.failures)
    workflow_path.write_text(original)
    passed = await run(data)
    assert passed.passed
    assert passed.context.workflow_sha256 != failed.context.workflow_sha256
    assert any(
        event.type == "transition" and event.details["destination"] == "confirm" for event in passed.timeline
    )


async def test_workflow_hash_preserves_crlf_source_for_studio_matching(tmp_path):
    import hashlib
    import shutil

    from test_scenario_runner import REPAIR

    shutil.copytree(REPAIR, tmp_path / "repair")
    path = tmp_path / "repair/agent.yaml"
    content = path.read_bytes().replace(b"\n", b"\r\n")
    path.write_bytes(content)
    data = repair_scenario()
    data["workflow"] = str(path)
    report = await run(data)
    assert report.passed
    assert report.context.workflow_sha256 == hashlib.sha256(content).hexdigest()


async def test_saved_diagnostic_keeps_missing_fields_route_and_policy_references(tmp_path):
    import shutil

    import yaml
    from test_scenario_runner import REPAIR

    shutil.copytree(REPAIR, tmp_path / "repair")
    path = tmp_path / "repair/agent.yaml"
    workflow = yaml.safe_load(path.read_text())
    workflow["nodes"]["collect"]["edges"].append(
        {"id": "premature", "to": "book", "condition": "Try without details"}
    )
    path.write_text(yaml.safe_dump(workflow))
    data = repair_scenario()
    data["workflow"] = str(path)
    data["steps"] = [
        {"kind": "turn", "id": "attempt", "text": "try", "evaluation": {"matches": ["premature"]}},
        {"kind": "expect", "action_count": 0},
    ]
    data["expected_codes"] = ["missing_facts"]
    report = await run(data)
    assert report.passed, report.failures
    blocked = next(event.details for event in report.timeline if event.type == "action_blocked")
    assert "address" in blocked["missing_fields"]
    assert blocked["source"] == "collect" and blocked["edge"] == "premature"
    assert blocked["policy"] == "booking"


async def test_sensitive_boolean_failure_operands_are_redacted_by_field_identity():
    data = repair_scenario()
    data["sensitive_fields"] = ["consent"]
    data["steps"][1]["facts"] = {"consent": False}
    report = await run(data)
    assert not report.passed
    failure = next(item for item in report.failures if "fact consent" in item)
    assert "[redacted]" in failure
    assert "False" not in failure and "True" not in failure


async def test_earlier_normalized_sensitive_values_stay_redacted_after_replacement():
    data = repair_scenario(approval=False)
    data["sensitive_fields"] = ["address"]
    data["steps"][0]["text"] = "book Taylor Hidden Address oven morning"
    data["steps"][0]["evaluation"]["updates"]["address"] = {"value": "  Hidden Address  ", "evidence": "book"}
    data["steps"][1]["facts"] = {"address": "Not it"}
    data["steps"] += [
        {
            "kind": "turn",
            "id": "replace",
            "text": "New Address",
            "evaluation": {"updates": {"address": {"value": "New Address", "evidence": "New Address"}}},
        },
    ]
    report = await run(data)
    assert not report.passed
    assert "Hidden Address" not in report.model_dump_json()
    assert "New Address" not in report.model_dump_json()


async def test_sensitive_value_collisions_never_rewrite_executable_identifiers():
    data = repair_scenario()
    data["sensitive_fields"] = ["consent", "address"]
    data["steps"][0]["text"] = "book Taylor book oven morning"
    data["steps"][0]["evaluation"]["updates"]["address"] = {"value": "book", "evidence": "book"}
    report = await run(data)
    assert report.passed, report.failures
    assert report.actions[0]["tool"] == "book_visit"
    assert report.facts["address"] == "[redacted]"
    readback = next(event for event in report.timeline if event.type == "readback")
    assert readback.details["policy"] == "booking"
    assert any(event.details.get("destination") == "book" for event in report.timeline)
    assert (
        next(event for event in report.timeline if event.type == "tool_result").details["tool"]
        == "book_visit"
    )


async def test_sensitive_boolean_mapped_arguments_are_hidden_before_formatting(tmp_path):
    import shutil

    import yaml
    from test_scenario_runner import REPAIR

    shutil.copytree(REPAIR, tmp_path / "repair")
    path = tmp_path / "repair/agent.yaml"
    workflow = yaml.safe_load(path.read_text())
    workflow["nodes"]["book"]["arguments"]["permission"] = "consent"
    path.write_text(yaml.safe_dump(workflow))
    data = repair_scenario()
    data["workflow"] = str(path)
    data["tools"]["book_visit"]["parameters"]["permission"] = "boolean"
    data["sensitive_fields"] = ["consent"]
    data["steps"][-1]["action_arguments"] = [{"permission": False}]
    report = await run(data)
    assert not report.passed
    failure = next(value for value in report.failures if "action_arguments" in value)
    assert "False" not in failure and "True" not in failure
    assert "[redacted]" in failure
    assert report.actions[0]["arguments"]["permission"] == "[redacted]"
    assert report.actions[0]["tool"] == "book_visit"
