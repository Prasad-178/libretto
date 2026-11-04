from pathlib import Path

import pytest
from support.workflow_harness import RecordingToolHandler

from libretto.state import ToolResult
from libretto.tool_contracts import ActionContext, ParameterSpec, ToolDefinition
from libretto.tools import ToolRegistry


def definition():
    return ToolDefinition(
        "book_visit", (ParameterSpec("address", "string"),), ("booked", "failed", "unknown")
    )


async def test_register_unrelated_tool_and_manifest():
    registry = ToolRegistry()
    registry.register(
        definition(), RecordingToolHandler(ToolResult(status="booked", data={"receipt": "repair-1"}))
    )
    assert registry.manifest() == [
        {
            "name": "book_visit",
            "parameters": [{"name": "address", "type": "string", "required": True}],
            "results": ["booked", "failed", "unknown"],
        }
    ]
    result = await registry.execute(
        "book_visit", {"address": "7 Test St"}, ActionContext("session", "request", "key")
    )
    assert result.data == {"receipt": "repair-1"}


def test_duplicate_name_rejected():
    registry = ToolRegistry()
    handler = RecordingToolHandler(ToolResult(status="booked"))
    registry.register(definition(), handler)
    with pytest.raises(ValueError, match="already registered"):
        registry.register(definition(), handler)


async def test_unknown_tool_never_calls_handler():
    registry = ToolRegistry()
    handler = RecordingToolHandler(ToolResult(status="booked"))
    registry.register(definition(), handler)
    with pytest.raises(ValueError, match="Unregistered"):
        await registry.execute("delete_files", {}, ActionContext("session", "request", "key"))
    assert handler.calls == []


async def test_registration_snapshot_survives_later_mutation():
    registry = ToolRegistry()
    registry.register(definition(), RecordingToolHandler(ToolResult(status="booked")))
    frozen = registry.snapshot()
    registry.register(
        ToolDefinition("other", (), ("failed", "unknown")), RecordingToolHandler(ToolResult(status="failed"))
    )
    assert frozen.names == {"book_visit"}
    with pytest.raises(ValueError, match="frozen"):
        frozen.register(
            ToolDefinition("other", (), ("failed", "unknown")),
            RecordingToolHandler(ToolResult(status="failed")),
        )
    manifest = frozen.manifest()
    manifest[0]["parameters"].clear()
    assert len(frozen.manifest()[0]["parameters"]) == 1


def test_core_registry_import_does_not_read_demo_directory(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Core registry read a file")

    monkeypatch.setattr(Path, "read_text", forbidden)
    assert ToolRegistry().manifest() == []


async def test_legacy_runtime_dispatch_keeps_application_context():
    from libretto.state import SessionState

    registry = ToolRegistry()
    registry.register(definition(), RecordingToolHandler(ToolResult(status="booked")))
    result = await registry.execute(
        "book_visit", {"address": "7 Test St"}, SessionState("collect"), "action-key"
    )
    assert result.status == "booked"


def test_definition_does_not_retain_mutable_input_lists():
    parameters = [ParameterSpec("address", "string")]
    results = ["booked", "failed", "unknown"]
    item = ToolDefinition("book_visit", parameters, results)
    parameters.clear()
    results.clear()
    assert len(item.parameters) == 1
    assert item.results == ("booked", "failed", "unknown")


@pytest.mark.parametrize("required", ["false", 0, None])
def test_parameter_required_flag_rejects_non_booleans(required):
    with pytest.raises(ValueError, match="required must be a boolean"):
        ParameterSpec("address", "string", required=required)


@pytest.mark.parametrize("result", ["", "   ", 1])
def test_tool_results_require_nonempty_string_statuses(result):
    with pytest.raises(ValueError, match="nonempty strings"):
        ToolDefinition("book_visit", (), (result, "failed", "unknown"))
