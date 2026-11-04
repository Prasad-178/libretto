"""Run with: uv run python -m examples.livekit_repair."""

import argparse
from pathlib import Path

import uvicorn

from examples.repair_visit.tools import create_tools
from libretto.server import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "repair_visit"
    app = create_app(workflow_path=root / "agent.yaml", project_root=root, tool_factory=create_tools)
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
