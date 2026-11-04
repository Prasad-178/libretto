import pytest
from support.workflow_harness import RecordingToolHandler
from test_action_lifecycle import SOURCE

from libretto.compiler import WorkflowCompileError, compile_workflow
from libretto.state import ToolResult
from libretto.tool_contracts import ParameterSpec, ToolDefinition
from libretto.tools import ToolRegistry


def registry():
    tools = ToolRegistry()
    handler = RecordingToolHandler(ToolResult(status="booked"))
    tools.register(
        ToolDefinition("book_visit", (ParameterSpec("address", "string"),), ("booked", "failed", "unknown")),
        handler,
    )
    return tools, handler


def test_valid_definition_is_compiled_with_registration_snapshot():
    tools, handler = registry()
    compiled = compile_workflow(SOURCE, tools=tools)
    assert compiled.workflow.id == "action"
    assert len(compiled.source_hash) == 64
    assert compiled.tools.names == {"book_visit"}
    assert handler.calls == []


@pytest.mark.parametrize(
    "old,new,code",
    [
        ("arguments: {address: address}", "arguments: {}", "missing_argument"),
        (
            "arguments: {address: address}",
            "arguments: {address: address, extra: address}",
            "unknown_argument",
        ),
        ("address: {type: string}", "address: {type: boolean}", "argument_type"),
        ("requires: [address]", "requires: []", "argument_not_required"),
        ("result: unknown", "result: missing", "unknown_result"),
        ("      - {id: unknown, to: wrap, result: unknown}\n", "", "missing_result"),
        ("result: failed", "result: booked", "duplicate_result"),
    ],
)
def test_invalid_action_contract_rejected_before_dispatch(old, new, code):
    tools, handler = registry()
    with pytest.raises(WorkflowCompileError) as error:
        compile_workflow(SOURCE.replace(old, new), tools=tools)
    assert any(issue.code == code and issue.path[:2] == ("nodes", "book") for issue in error.value.issues)
    assert handler.calls == []


def test_unregistered_tool_rejected():
    with pytest.raises(WorkflowCompileError) as error:
        compile_workflow(SOURCE, tools=ToolRegistry())
    assert any(issue.code == "unregistered_tool" for issue in error.value.issues)


def test_northline_compiles_against_explicit_demo_contracts():
    from pathlib import Path

    from libretto.demo_tools import DemoToolRegistry

    compiled = compile_workflow(
        Path("examples/receptionist.yaml").read_text(),
        tools=DemoToolRegistry(),
        project_root=Path("examples"),
    )
    assert compiled.tools.names == {"transfer_call", "capture_message"}


def test_source_symlink_cannot_escape_project_root(tmp_path):
    outside = tmp_path / "outside.md"
    outside.write_text("Secret")
    root = tmp_path / "project"
    (root / "knowledge").mkdir(parents=True)
    (root / "knowledge" / "linked.md").symlink_to(outside)
    source = SOURCE.replace("tools: [book_visit]", "knowledge: {policies: knowledge}\ntools: [book_visit]")
    with pytest.raises(WorkflowCompileError, match="inside project_root"):
        compile_workflow(source, tools=registry()[0], project_root=root)


@pytest.mark.parametrize(
    "old,new,path",
    [
        ("request: visit", "request: missing", ("confirmations", "booking", "request")),
        (
            "fields: [customer_name, address, issue, window]",
            "fields: [missing]",
            ("confirmations", "booking", "fields"),
        ),
        ("confirmation: booking", "confirmation: missing", ("nodes", "confirm", "confirmation")),
        ("begin_request: visit", "begin_request: missing", ("nodes", "collect", "begin_request")),
        (
            "    entry: respond\n    readback:",
            "    entry: wait\n    readback:",
            ("nodes", "confirm", "confirmation"),
        ),
    ],
)
def test_policy_contract_errors_identify_the_configuration_path(old, new, path):
    from test_repair_visit import ROOT, tools

    source = (ROOT / "agent.yaml").read_text().replace(old, new)
    with pytest.raises(WorkflowCompileError) as error:
        compile_workflow(source, tools=tools(), project_root=ROOT)
    assert error.value.issues[0].path == path
