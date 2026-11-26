import argparse
import json
from pathlib import Path

from libretto.compiler import WorkflowCompileError, compile_workflow
from libretto.schema import parse_workflow
from libretto.tools import ToolRegistry


def _read_source(path: Path, parser: argparse.ArgumentParser) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        parser.exit(2, f"libretto: cannot read {path}: {error}\n")


def main() -> None:
    parser = argparse.ArgumentParser(prog="libretto")
    parser.add_argument("command", choices=["validate", "graph", "serve", "evaluate", "test"])
    parser.add_argument("workflow", nargs="?", default=None)
    parser.add_argument("--project-root", type=Path)
    parser.add_argument("--demo-tools", action="store_true", help="Register the bundled simulated tools")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--live", action="store_true", help="Opt in to bounded paid model evaluation")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--json", action="store_true", help="Machine-readable scenario report")
    args = parser.parse_args()
    if args.command == "test":
        from libretto.testing.cli import test_command

        if args.workflow is None:
            parser.error("test requires a scenario file or directory")
        status = test_command(Path(args.workflow), machine_json=args.json, output=args.output)
        if status:
            raise SystemExit(status)
        return
    selected_workflow = args.workflow or "examples/receptionist.yaml"
    if args.command == "evaluate":
        import asyncio

        from libretto.evaluate import evaluate_live, evaluate_retrieval

        _read_source(Path(selected_workflow), parser)
        try:
            report = {"retrieval": evaluate_retrieval(Path(selected_workflow))}
        except (OSError, ValueError) as error:
            parser.exit(2, f"libretto: {selected_workflow}: {error}\n")
        if args.live:
            report["workflow"] = asyncio.run(evaluate_live(Path(selected_workflow)))
        args.output = args.output or Path(".local/evaluations/latest.json")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2))
        print(
            json.dumps(
                {key: {k: v for k, v in section.items() if k != "cases"} for key, section in report.items()},
                indent=2,
            )
        )
        print(f"Detailed report: {args.output}")
        if not all(section["passed"] for section in report.values()):
            raise SystemExit(1)
    elif args.command == "serve":
        try:
            import uvicorn

            from libretto.server import create_app
        except ModuleNotFoundError as error:
            if error.name not in {"uvicorn", "fastapi", "httpx", "dotenv", "websockets", "livekit"}:
                raise
            parser.exit(
                2,
                "libretto: serve requires the [studio] extra. Install it from the same Git revision "
                "as Libretto; in a source checkout run `uv sync --locked`. "
                "See docs/compatibility.md.\n",
            )

        try:
            application = create_app(
                workflow_path=Path(args.workflow) if args.workflow else None, project_root=args.project_root
            )
        except (OSError, ValueError) as error:
            parser.exit(2, f"libretto: cannot open Studio project: {error}\n")
        uvicorn.run(application, host="127.0.0.1", port=args.port)
    else:
        if args.command == "validate":
            tools = ToolRegistry()
            if args.demo_tools or args.workflow is None:
                from libretto.demo_tools import DemoToolRegistry

                tools = DemoToolRegistry()
            try:
                compiled = compile_workflow(
                    _read_source(Path(selected_workflow), parser),
                    tools=tools,
                    project_root=args.project_root or Path(selected_workflow).parent,
                )
                workflow = compiled.workflow
            except WorkflowCompileError as error:
                for issue in error.issues:
                    print(f"{'.'.join(map(str, issue.path)) or 'source'} [{issue.code}]: {issue.message}")
                raise SystemExit(1) from None
            print(f"Valid: {workflow.name} ({len(workflow.nodes)} nodes)")
        else:
            source = _read_source(Path(selected_workflow), parser)
            try:
                workflow = parse_workflow(source)
            except ValueError as error:
                parser.exit(2, f"libretto: {selected_workflow}: {error}\n")
            print(json.dumps(workflow.model_dump(), indent=2))
