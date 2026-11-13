"""Project semantic evidence and remove designated data before export.

This intentionally is not a transcript serializer. Credentials and arbitrary
provider/tool payloads have no place in the evidence projection.
"""

import json
from copy import deepcopy
from typing import Any

from libretto.compiler import CompiledWorkflow
from libretto.events import ServerEvent
from libretto.provenance import workflow_context
from libretto.state import SessionState

from .schema import EvidenceContext, EvidenceEvent, Expect, Scenario, Turn

REDACTED = "[redacted]"


class EvidenceProjection:
    """One run's known sensitive values and explicit field-to-argument mappings."""

    def __init__(self, scenario: Scenario, compiled: CompiledWorkflow) -> None:
        self.fields = set(scenario.sensitive_fields)
        if self.fields - compiled.workflow.fields.keys():
            raise ValueError("Unknown sensitive field; check sensitive_fields against the workflow")
        self.arguments: dict[str, set[str]] = {}
        for node in compiled.workflow.nodes.values():
            if node.tool:
                self.arguments.setdefault(node.tool, set()).update(
                    parameter for parameter, field in node.arguments.items() if field in self.fields
                )
        self.tokens: set[str] = set()
        for step in scenario.steps:
            if isinstance(step, Turn):
                for field, patch in step.evaluation.updates.items():
                    if field in self.fields:
                        self._remember(patch.value)
            elif isinstance(step, Expect):
                for field, value in step.facts.items():
                    if field in self.fields:
                        self._remember(value)
                if any(self.arguments.values()):
                    for fingerprint in step.argument_fingerprints or []:
                        self._remember(fingerprint)
                sensitive_parameters = set().union(*self.arguments.values()) if self.arguments else set()
                for arguments in step.action_arguments or []:
                    for parameter, value in arguments.items():
                        if parameter in sensitive_parameters:
                            self._remember(value)
        self.scenario, self.compiled = scenario, compiled

    def _remember(self, value: Any) -> None:
        if isinstance(value, str):
            for variant in {value, value.strip()} - {""}:
                self.tokens.update(
                    (
                        variant,
                        repr(variant)[1:-1],
                        json.dumps(variant, ensure_ascii=False)[1:-1],
                        json.dumps(variant, ensure_ascii=True)[1:-1],
                    )
                )

    def finalize(self, state: SessionState) -> None:
        """Include normalized runtime values and sensitive hashes before cleaning failures."""
        for field, value in state.values().items():
            if field in self.fields:
                self._remember(value)
        for receipt in state.receipts:
            if self.arguments.get(receipt["tool"]):
                self._remember(receipt["argument_fingerprint"])

    def clean(self, value: Any) -> Any:
        if isinstance(value, str):
            for token in sorted(self.tokens, key=len, reverse=True):
                value = value.replace(token, REDACTED)
            return value
        if isinstance(value, list):
            return [self.clean(item) for item in value]
        if isinstance(value, dict):
            return {key: self.clean(item) for key, item in value.items()}
        return value

    def assertion_operands(self, key: str, expected: Any, actual: Any, calls: list[dict]) -> tuple[Any, Any]:
        """Remove sensitive operands by identity before their repr enters a failure string."""
        if key == "action_arguments":
            all_sensitive = set().union(*self.arguments.values()) if self.arguments else set()

            def redact(items: list[dict]) -> list[dict]:
                output = []
                for index, arguments in enumerate(items):
                    fields = (
                        self.arguments.get(calls[index]["tool"], set())
                        if index < len(calls)
                        else all_sensitive
                    )
                    output.append(
                        {
                            name: REDACTED if name in fields else self.clean(value)
                            for name, value in arguments.items()
                        }
                    )
                return output

            return redact(expected), redact(actual)
        if key == "argument_fingerprints" and any(self.arguments.get(call["tool"]) for call in calls):
            return [REDACTED] * len(expected), [REDACTED] * len(actual)
        return expected, actual

    def facts(self, facts: dict) -> dict:
        return {key: REDACTED if key in self.fields else self.clean(value) for key, value in facts.items()}

    def action(self, action: dict) -> dict:
        output = deepcopy(action)
        sensitive = self.arguments.get(action["tool"], set())
        output["arguments"] = {
            key: REDACTED if key in sensitive else self.clean(value)
            for key, value in action["arguments"].items()
        }
        if sensitive:
            # Unsalted hashes can reveal low-entropy values through guessing.
            output["argument_fingerprint"] = REDACTED
        return output

    def context(self) -> EvidenceContext:
        context = workflow_context(self.compiled, mode="scripted")
        return EvidenceContext(**context, redacted_fields=sorted(self.fields))

    def timeline(self, events: list[ServerEvent], requests: dict[str, str]) -> list[EvidenceEvent]:
        output = []
        for event in events:
            data = event.data
            if event.type == "state":
                request = data.get("request")
                details = {
                    "active_stage": data.get("active_stage"),
                    "pending_stage": data.get("pending_stage"),
                    "facts": self.facts(
                        {key: fact.get("value") for key, fact in data.get("facts", {}).items()}
                    ),
                    "request": {
                        "name": request["name"],
                        "reference": requests.get(request["id"], "no-request"),
                    }
                    if request
                    else None,
                }
            elif event.type == "tool_started":
                details = self.action(
                    {
                        "tool": data["tool"],
                        "arguments": data["arguments"],
                        "argument_fingerprint": "",
                        "request": requests.get(data.get("request_id"), "no-request"),
                    }
                )
                details.pop("argument_fingerprint")
            elif event.type == "tool_result":
                details = {
                    "tool": data["tool"],
                    "status": data["status"],
                    "request": requests.get(data.get("request_id"), "no-request"),
                    **{
                        key: data[key]
                        for key in ("node", "policy", "code", "reason")
                        if data.get(key) is not None
                    },
                }
            elif event.type == "retrieval":
                details = {"passages": [passage["chunk_id"] for passage in data.get("passages", [])]}
            elif event.type in {
                "transition",
                "readback",
                "confirmation_withheld",
                "action_blocked",
                "readback_blocked",
                "evaluation_error",
                "error",
                "interrupted",
                "ended",
                "expired",
            }:
                allowed = {
                    "source",
                    "destination",
                    "edge",
                    "node",
                    "policy",
                    "code",
                    "reason",
                    "missing_fields",
                }
                details = {key: value for key, value in data.items() if key in allowed}
                if data.get("request_id"):
                    details["request"] = requests.get(data["request_id"], "no-request")
            else:
                continue
            if "reason" in details:
                details["reason"] = self.clean(details["reason"])
            output.append(
                EvidenceEvent(sequence=len(output) + 1, type=event.type, epoch=event.epoch, details=details)
            )
        return output
