"""The starter must work in a consuming project, not only this checkout."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from libretto.testing import load_scenario, run_scenario

STARTER = Path(__file__).resolve().parents[1] / "examples/quickstart"


@pytest.fixture
def project(tmp_path):
    target = tmp_path / "my-agent"
    shutil.copytree(STARTER, target)
    return target


async def test_quickstart_blocks_missing_details_then_records_exact_arguments(project):
    report = await run_scenario(
        load_scenario(project / "record-request.scenario.yaml"), base_dir=project
    )
    assert report.passed, report.failures
    assert report.completed
    assert report.stages == ["collect", "record", "end"]
    assert [action["arguments"] for action in report.actions] == [{"summary": "Printer is jammed"}]
    assert report.context.mode == "scripted"


def test_copied_quickstart_calls_registered_handler_from_another_directory(project, tmp_path):
    result = subprocess.run(
        [sys.executable, str(project / "app.py")], cwd=tmp_path,
        text=True, capture_output=True, timeout=15,
    )
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert output == {
        "stage": "end", "tool": "record_request", "status": "recorded",
        "arguments": {"summary": "Printer is jammed"},
        "receipt": "fictional-request-1",
    }


def test_quickstart_wrong_expected_action_count_fails_cli(project):
    path = project / "record-request.scenario.yaml"
    scenario = yaml.safe_load(path.read_text())
    scenario["steps"][-1]["action_count"] = 2
    path.write_text(yaml.safe_dump(scenario))
    result = subprocess.run(
        [sys.executable, "-c", "from libretto.cli import main; main()", "test", str(path)], cwd=project,
        text=True, capture_output=True, timeout=15,
    )
    assert result.returncode == 1
    assert "action_count: expected 2, got 1" in result.stdout
