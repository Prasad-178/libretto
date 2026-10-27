import argparse
import json
from pathlib import Path

from libretto.schema import load_workflow


def main() -> None:
    parser = argparse.ArgumentParser(prog="libretto")
    parser.add_argument("command", choices=["validate", "graph", "serve", "evaluate"])
    parser.add_argument("workflow", nargs="?", default="examples/receptionist.yaml")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--live", action="store_true", help="Opt in to bounded paid model evaluation")
    parser.add_argument("--output", type=Path, default=Path(".local/evaluations/latest.json"))
    args = parser.parse_args()
    if args.command == "evaluate":
        import asyncio

        from libretto.evaluate import evaluate_live, evaluate_retrieval

        report = {"retrieval": evaluate_retrieval(Path(args.workflow))}
        if args.live:
            report["workflow"] = asyncio.run(evaluate_live(Path(args.workflow)))
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

        uvicorn.run(create_app(), host="127.0.0.1", port=args.port)
    else:
        workflow = load_workflow(Path(args.workflow))
        if args.command == "validate":
            print(f"Valid: {workflow.name} ({len(workflow.nodes)} nodes)")
        else:
            print(json.dumps(workflow.model_dump(), indent=2))
