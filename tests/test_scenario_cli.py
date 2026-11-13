"""Exercise the installed CLI boundary with real scenario files."""

import json
import subprocess
import sys
from pathlib import Path

import yaml
from test_scenario_runner import repair_scenario


def invoke(path, *flags):
    return subprocess.run(
        [str(Path(sys.executable).with_name("libretto")), "test", str(path), *flags],
        capture_output=True,
        text=True,
        timeout=10,
    )


def write(tmp_path, data, name="repair.scenario.yaml"):
    path = tmp_path / name
    path.write_text(yaml.safe_dump(data))
    return path


def test_cli_passes_and_json_is_machine_readable(tmp_path):
    path = write(tmp_path, repair_scenario())
    result = invoke(path, "--json")
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data["passed"] is True
    assert data["scenarios"][0]["actions"][0]["status"] == "booked"
    assert data["errors"] == []


def test_cli_failed_assertions_exit_one_with_useful_human_output(tmp_path):
    data = repair_scenario()
    data["steps"][-1]["action_count"] = 9
    result = invoke(write(tmp_path, data))
    assert result.returncode == 1
    assert "FAIL Repair" in result.stdout
    assert "expected 9, got 1" in result.stdout


def test_cli_invalid_setup_and_empty_directories_exit_two(tmp_path):
    for path in [tmp_path, tmp_path / "missing.yaml", write(tmp_path, {"version": 2})]:
        result = invoke(path, "--json")
        assert result.returncode == 2
        assert json.loads(result.stdout)["errors"]


def test_cli_directory_is_sorted_and_invalid_setup_takes_precedence(tmp_path):
    write(tmp_path, repair_scenario(), "b.scenario.yaml")
    data = repair_scenario()
    data["name"] = "First"
    write(tmp_path, data, "a.scenario.yaml")
    (tmp_path / "README.md").write_text("Not a scenario")
    result = invoke(tmp_path, "--json")
    assert result.returncode == 0, result.stdout
    assert [item["name"] for item in json.loads(result.stdout)["scenarios"]] == ["First", "Repair"]
    write(tmp_path, {"version": 2}, "c.scenario.yaml")
    data["steps"][-1]["action_count"] = 8
    write(tmp_path, data, "a.scenario.yaml")
    result = invoke(tmp_path, "--json")
    assert result.returncode == 2
    assert json.loads(result.stdout)["passed"] is False


def test_cli_core_only_does_not_import_inference_or_livekit(tmp_path):
    path = write(tmp_path, repair_scenario())
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; from libretto.cli import main; "
            f'sys.argv = ["libretto", "test", {str(path)!r}, "--json"]; '
            'main(); assert not any(n.startswith(("livekit", "httpx", "fastapi")) for n in sys.modules)',
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
