import argparse
import json
from pathlib import Path

from libretto.schema import load_workflow


def main() -> None:
    parser = argparse.ArgumentParser(prog="libretto")
    parser.add_argument("command", choices=["validate", "graph", "serve"])
    parser.add_argument("workflow", nargs="?", default="examples/receptionist.yaml")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if args.command == "serve":
        import uvicorn

        uvicorn.run("app:app", host="127.0.0.1", port=args.port)
    else:
        workflow = load_workflow(Path(args.workflow))
        if args.command == "validate":
            print(f"Valid: {workflow.name} ({len(workflow.nodes)} nodes)")
        else:
            print(json.dumps(workflow.model_dump(), indent=2))
