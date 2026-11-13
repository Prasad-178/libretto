"""Shared provenance identifies actual configuration, never authentication state."""

from pathlib import Path

from fastapi.testclient import TestClient

from libretto.compiler import compile_workflow
from libretto.provenance import workflow_context
from libretto.server import create_app
from libretto.tools import ToolRegistry


def test_shared_context_uses_workflow_source_and_explicit_effective_model_configuration():
    compiled = compile_workflow(Path("examples/minimal.yaml").read_text(), tools=ToolRegistry())
    context = workflow_context(
        compiled,
        mode="text",
        models={"speaker": "test/speaker", "evaluator": "test/controller"},
        identity={"libretto_version": "test-version", "libretto_commit": None, "source_dirty": None},
    )
    assert context["workflow_sha256"] == compiled.source_hash
    assert context["yaml_schema_version"] == 1
    assert context["models"]["speaker"] == "test/speaker"
    assert context["mode"] == "text"
    assert context["libretto_version"] == "test-version"
    assert "credentials" not in context and "shared_prompt" not in context


def test_real_websocket_ready_and_export_include_effective_configuration_without_keys(monkeypatch):
    class Model:
        async def close(self):
            pass

    monkeypatch.setenv("LIBRETTO_ALLOW_HOSTED_KEYS", "false")
    with TestClient(
        create_app(load_environment=False, model_factory=lambda *args, **kwargs: Model())
    ) as client:
        with client.websocket_connect("/api/ws") as ws:
            ws.send_json(
                {
                    "type": "start",
                    "mode": "text",
                    "openrouter_key": "PRIVATE_TEST_KEY",
                    "speaker_model": "test/speaker",
                    "evaluator_model": "test/evaluator",
                }
            )
            ready = ws.receive_json()
            assert ready["type"] == "ready"
            context = ready["data"]["context"]
            assert context["models"]["speaker"] == "test/speaker"
            assert context["models"]["evaluator"] == "test/evaluator"
            assert len(context["workflow_sha256"]) == 64
            ws.send_json({"type": "export"})
            while True:
                packet = ws.receive_json()
                assert "PRIVATE_TEST_KEY" not in str(packet)
                if packet["type"] == "export":
                    break
            assert packet["data"]["format"] == "libretto.session-evidence"
            assert packet["data"]["version"] == 1
            assert packet["data"]["context"] == context
            assert isinstance(packet["data"]["request_ids"], list)
            ws.send_json({"type": "close"})
