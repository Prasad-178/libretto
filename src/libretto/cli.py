import argparse
import json
from pathlib import Path

from libretto.compiler import WorkflowCompileError, compile_workflow
from libretto.schema import load_workflow
from libretto.tools import ToolRegistry


def main() -> None:
    parser = argparse.ArgumentParser(prog="libretto")
    parser.add_argument("command", choices=["validate", "graph", "serve", "evaluate"])
    parser.add_argument("workflow", nargs="?", default=None)
    parser.add_argument("--project-root", type=Path)
    parser.add_argument("--demo-tools", action="store_true", help="Register the bundled simulated tools")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--live", action="store_true", help="Opt in to bounded paid model evaluation")
    parser.add_argument("--output", type=Path, default=Path(".local/evaluations/latest.json"))
    args = parser.parse_args()
    selected_workflow = args.workflow or "examples/receptionist.yaml"
    if args.command == "evaluate":
        import asyncio

        from libretto.evaluate import evaluate_live, evaluate_retrieval

        report = {"retrieval": evaluate_retrieval(Path(selected_workflow))}
        if args.live:
            report["workflow"] = asyncio.run(evaluate_live(Path(selected_workflow)))
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
        import uvicorn

        from libretto.server import create_app

        uvicorn.run(
            create_app(
                workflow_path=Path(args.workflow) if args.workflow else None, project_root=args.project_root
            ),
            host="127.0.0.1",
            port=args.port,
        )
    else:
        if args.command == "validate":
            tools = ToolRegistry()
            if args.demo_tools or args.workflow is None:
                from libretto.demo_tools import DemoToolRegistry

                tools = DemoToolRegistry()
            try:
                compiled = compile_workflow(
                    Path(selected_workflow).read_text(),
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
            workflow = load_workflow(Path(selected_workflow))
            print(json.dumps(workflow.model_dump(), indent=2))
