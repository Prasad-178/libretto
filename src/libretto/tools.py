"""Registered local demonstration tools. No outbound business actions."""

import json
import re
import uuid
from pathlib import Path

from libretto.state import SessionState, ToolResult, details_fingerprint


class ToolRegistry:
    names = {"transfer_call", "capture_message"}

    def __init__(self, directory: list[dict] | None = None):
        if directory is None:
            path = Path(__file__).resolve().parents[2] / "examples/directory.json"
            directory = json.loads(path.read_text()) if path.exists() else []
        self.directory = directory
        self._cache: dict[str, ToolResult] = {}

    def validate(self, workflow) -> None:
        if unknown := set(workflow.tools) - self.names:
            raise ValueError(f"Unregistered tools: {sorted(unknown)}")

    async def execute(self, name: str, arguments: dict, state: SessionState, key: str) -> ToolResult:
        if name not in self.names:
            raise ValueError("Unregistered action")
        recipient = arguments.get("recipient")
        if recipient not in {entry["id"] for entry in self.directory}:
            return ToolResult(status="failed", data={"reason": "The recipient is not in the directory."})
        if name == "transfer_call":
            if not state.values().get("destination_confirmed"):
                return ToolResult(status="failed", data={"reason": "Destination not confirmed."})
            outcome = state.transfer_outcome
            if outcome not in {"connected", "unavailable", "failed", "timeout"}:
                outcome = "failed"
            return ToolResult(status=outcome, data={"recipient": recipient, "simulated": True})
        values = state.values()
        phone = re.sub(r"\D", "", str(arguments.get("callback_number", "")))
        if (
            not values.get("message_consent")
            or not values.get("message_confirmed")
            or not 7 <= len(phone) <= 15
            or not state.readback_fingerprint
            or state.readback_fingerprint != details_fingerprint(values)
            or any(
                arguments.get(field) != values.get(field)
                for field in ("recipient", "caller_name", "callback_number", "message")
            )
        ):
            return ToolResult(
                status="failed", data={"reason": "Current details need validation and confirmation."}
            )
        if key not in self._cache:
            self._cache[key] = ToolResult(
                status="captured",
                data={
                    "receipt": "demo-" + uuid.uuid4().hex[:10],
                    "session_only": True,
                    **arguments,
                },
            )
        return self._cache[key]
