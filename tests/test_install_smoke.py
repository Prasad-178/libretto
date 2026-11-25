"""Exercise the built wheel outside the source tree, with only core dependencies."""

import json
import os
import shutil
import subprocess
from email.parser import BytesParser
from pathlib import Path
from zipfile import ZipFile

import yaml


def test_clean_core_wheel_runs_without_server_demo_or_credentials(tmp_path):
    root = Path(__file__).resolve().parents[1]
    environment = {
        key: value
        for key, value in os.environ.items()
        if key
        not in {
            "PYTHONPATH",
            "VIRTUAL_ENV",
            "UV_PROJECT_ENVIRONMENT",
            "OPENROUTER_API_KEY",
            "DEEPGRAM_API_KEY",
            "LIVEKIT_API_KEY",
            "LIVEKIT_API_SECRET",
            "ASSEMBLYAI_API_KEY",
            "CARTESIA_API_KEY",
        }
    }
    subprocess.run(
        ["uv", "build", "--wheel", "--out-dir", str(tmp_path / "dist")],
        cwd=root,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(["uv", "venv", str(tmp_path / "venv")], env=environment, check=True, capture_output=True)
    python = tmp_path / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    wheel = next((tmp_path / "dist").glob("*.whl"))
    with ZipFile(wheel) as archive:
        metadata_name = next(name for name in archive.namelist() if name.endswith(".dist-info/METADATA"))
        metadata = BytesParser().parsebytes(archive.read(metadata_name))
        assert metadata["Version"] == "0.1.0"
        assert metadata["License-Expression"] == "MIT"
        assert metadata.get_all("License-File") == ["LICENSE"]
        license_name = metadata_name.rsplit("/", 1)[0] + "/licenses/LICENSE"
        assert archive.read(license_name) == (root / "LICENSE").read_bytes()
    subprocess.run(
        ["uv", "pip", "install", "--python", str(python), str(wheel)],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    script = tmp_path / "run.py"
    script.write_text('''import asyncio,importlib.util,sys
from libretto import (compile_workflow,WorkflowRunner,ToolRegistry,ToolDefinition,ParameterSpec,ToolResult,Evaluation)
assert importlib.util.find_spec('fastapi') is None
assert importlib.util.find_spec('livekit') is None
assert 'libretto.server' not in sys.modules
source="""version: 1
id: smoke
name: Smoke
start: collect
shared_prompt: Help
fields: {address: {type: string}}
requests: {visit: {fields: [address]}}
tools: [book]
nodes:
  collect:
    kind: conversation
    begin_request: visit
    edges: [{id: go, to: action, condition: ready}]
  action:
    kind: action
    tool: book
    requires: [address]
    arguments: {address: address}
    edges:
      - {id: ok, to: end, result: booked}
      - {id: fail, to: end, result: failed}
      - {id: unknown, to: end, result: unknown}
  end: {kind: end}
"""
class Provider:
    async def stream_reply(self,context): yield 'Checking.'
    async def evaluate(self,context):
        return Evaluation(updates={'address':{'value':'7 Test','evidence':'7 Test'}},matches=['go'])
async def main():
    tools=ToolRegistry()
    async def book(arguments,context):
        assert context.request_id and context.idempotency_key
        return ToolResult(status='booked',data={'address':arguments['address']})
    tools.register(ToolDefinition('book',(ParameterSpec('address','string'),),('booked','failed','unknown')),book)
    runner=WorkflowRunner(compile_workflow(source,tools=tools),responder=Provider(),evaluator=Provider())
    await runner.submit('7 Test',turn_id='one')
    events=[event async for event in runner.events()]
    assert any(e.type=='tool_result' and e.data['status']=='booked' for e in events)
    await runner.close()
asyncio.run(main())
print('core smoke passed')
''')
    result = subprocess.run(
        [str(python), str(script)], cwd=tmp_path, env=environment, capture_output=True, text=True, timeout=30
    )
    assert result.returncode == 0, result.stderr
    assert "core smoke passed" in result.stdout

    # The shipped scenario CLI must also work with only the installed wheel.
    external = tmp_path / "project"
    fixture = external / "repair"
    fixture.mkdir(parents=True)
    shutil.copy2(root / "examples/repair_visit/agent.yaml", fixture / "agent.yaml")
    shutil.copytree(root / "examples/repair_visit/knowledge", fixture / "knowledge")
    scenario = yaml.safe_load((root / "examples/scenarios/repair-booking.scenario.yaml").read_text())
    scenario["workflow"] = "repair/agent.yaml"
    scenario_path = external / "booking.scenario.yaml"
    scenario_path.write_text(yaml.safe_dump(scenario))
    evidence_path = external / "evidence.json"
    executable = python.with_name("libretto.exe" if os.name == "nt" else "libretto")
    result = subprocess.run(
        [str(executable), "test", str(scenario_path), "--output", str(evidence_path)],
        cwd=external,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    evidence = json.loads(evidence_path.read_text())
    assert evidence["runs"][0]["passed"]
    assert evidence["runs"][0]["context"]["libretto_commit"] is None
    assert evidence["runs"][0]["facts"]["address"] == "[redacted]"
