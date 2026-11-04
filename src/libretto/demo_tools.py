"""Registered local demonstration tools. No outbound business actions."""

import hashlib
import json
import re
import uuid
from pathlib import Path
from typing import Any

from libretto.state import SessionState, ToolResult
from libretto.tool_contracts import ParameterSpec, ToolDefinition
from libretto.tools import ToolRegistry


class DemoToolRegistry:
    names = {"transfer_call", "capture_message"}

    def __init__(self, directory: list[dict] | None = None):
        if directory is None:
            path = Path(__file__).resolve().parents[2] / "examples/directory.json"
            directory = json.loads(path.read_text()) if path.exists() else []
        self.directory = directory
        self._cache: dict[str, ToolResult] = {}
        self.transfer_outcome = "unavailable"

    def snapshot(self) -> ToolRegistry:
        """Compose explicit simulated handlers without capturing live session facts."""
        registry = ToolRegistry()
        recipients = frozenset(entry["id"] for entry in self.directory)
        outcome = self.transfer_outcome
        cache = {}

        async def transfer(arguments, context):
            if arguments["recipient"] not in recipients:
                return ToolResult(status="failed", data={"reason": "Unknown recipient."})
            return ToolResult(status=outcome, data={**arguments, "simulated": True})

        async def capture(arguments, context):
            phone = re.sub(r"\D", "", arguments["callback_number"])
            if arguments["recipient"] not in recipients or not 7 <= len(phone) <= 15:
                return ToolResult(status="failed", data={"reason": "Invalid message details."})
            if context.idempotency_key not in cache:
                cache[context.idempotency_key] = ToolResult(
                    status="captured",
                    data={**arguments, "receipt": "demo-" + uuid.uuid4().hex[:10], "session_only": True},
                )
            return cache[context.idempotency_key].model_copy(deep=True)

        for contract, handler in zip(self.manifest(), (transfer, capture)):
            registry.register(
                ToolDefinition(
                    contract["name"],
                    tuple(ParameterSpec(**p) for p in contract["parameters"]),
                    tuple(contract["results"]),
                ),
                handler,
            )
        return registry.snapshot()

    def manifest(self) -> list[dict]:
        return [
            {
                "name": "transfer_call",
                "parameters": [{"name": "recipient", "type": "string", "required": True}],
                "results": ["connected", "unavailable", "failed", "timeout", "unknown"],
            },
            {
                "name": "capture_message",
                "parameters": [
                    {"name": name, "type": "string", "required": True}
                    for name in ["recipient", "caller_name", "callback_number", "message"]
                ],
                "results": ["captured", "failed", "unknown"],
            },
        ]

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
            outcome = getattr(state, "transfer_outcome", "unavailable")
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


DETAIL_FIELDS = ("recipient", "caller_name", "callback_number", "message")


def details_fingerprint(values: dict[str, Any]) -> str | None:
    if not all(values.get(key) for key in DETAIL_FIELDS):
        return None
    encoded = json.dumps({key: values[key] for key in DETAIL_FIELDS}, sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()
