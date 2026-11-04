"""Compile one definition against explicit, application-owned capabilities."""

import hashlib
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from libretto.retrieval import RetrievalIndex, build_index
from libretto.schema import Workflow, parse_workflow
from libretto.tools import ToolRegistry


@dataclass(frozen=True)
class CompileIssue:
    path: tuple[str | int, ...]
    code: str
    message: str


class WorkflowCompileError(ValueError):
    def __init__(self, issues: list[CompileIssue]):
        self.issues = issues
        super().__init__("; ".join(issue.message for issue in issues))


@dataclass(frozen=True)
class CompiledWorkflow:
    workflow: Workflow
    source_hash: str
    index: RetrievalIndex
    tools: ToolRegistry


def compile_workflow(
    source: str, *, tools: ToolRegistry, project_root: Path | None = None
) -> CompiledWorkflow:
    try:
        workflow = parse_workflow(source)
    except ValidationError as error:
        raise WorkflowCompileError(
            [
                CompileIssue(tuple(item["loc"]), item["type"], item["msg"])
                for item in error.errors(include_input=False)
            ]
        ) from error
    except ValueError as error:
        raise WorkflowCompileError([CompileIssue((), "invalid_yaml", str(error))]) from error
    manifest = {item["name"]: item for item in tools.manifest()}
    issues = []
    for name in workflow.tools:
        if name not in manifest:
            issues.append(CompileIssue(("tools",), "unregistered_tool", f"Unregistered tool: {name}"))
    for node_id, node in workflow.nodes.items():
        if node.kind != "action" or node.tool not in manifest:
            continue
        contract = manifest[node.tool]
        parameters = {parameter["name"]: parameter for parameter in contract["parameters"]}

        def issue(code, message, detail="arguments"):
            issues.append(CompileIssue(("nodes", node_id, detail), code, message))

        for name, parameter in parameters.items():
            field = node.arguments.get(name)
            if field is None:
                if parameter["required"]:
                    issue("missing_argument", f"Map required parameter {name}")
                continue
            if field not in node.requires:
                issue("argument_not_required", f"Add mapped field {field} to requires")
            if workflow.fields[field].type != parameter["type"]:
                issue("argument_type", f"Wrong type for {name}")
        for name in node.arguments.keys() - parameters.keys():
            issue("unknown_argument", f"Unknown parameter {name}")
        outcomes = [edge.result for edge in node.edges]
        for result in contract["results"]:
            count = outcomes.count(result)
            if not count:
                issue("missing_result", f"Add a route for {result}", "edges")
            if count > 1:
                issue("duplicate_result", f"Use one route for {result}", "edges")
        for result in outcomes:
            if result not in contract["results"]:
                issue("unknown_result", f"Unknown result {result}", "edges")
        if not {"failed", "unknown"} <= set(contract["results"]):
            issue("missing_recovery", "Tool must declare failed and unknown outcomes", "tool")
    if issues:
        raise WorkflowCompileError(issues)
    try:
        if workflow.knowledge and project_root is None:
            raise ValueError("A project_root is required for knowledge sources")
        if project_root is not None:
            root = project_root.resolve()
            for relative in workflow.knowledge.values():
                directory = (root / relative).resolve()
                if (
                    Path(relative).is_absolute()
                    or ".." in Path(relative).parts
                    or not directory.is_relative_to(root)
                ):
                    raise ValueError("Knowledge must remain inside project_root")
                if any(not file.resolve().is_relative_to(root) for file in directory.glob("*.md")):
                    raise ValueError("Knowledge files must remain inside project_root")
            index = build_index(workflow, root)
        else:
            index = RetrievalIndex([])
    except ValueError as error:
        raise WorkflowCompileError([CompileIssue(("knowledge",), "invalid_source", str(error))]) from error
    return CompiledWorkflow(
        workflow.model_copy(deep=True), hashlib.sha256(source.encode()).hexdigest(), index, tools.snapshot()
    )
