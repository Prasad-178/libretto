"""Project semantic evidence and remove designated data before export.

This intentionally is not a transcript serializer. Credentials and arbitrary
provider/tool payloads have no place in the evidence projection.
"""

import json
import subprocess
from copy import deepcopy
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from libretto.compiler import CompiledWorkflow
from libretto.events import ServerEvent
from libretto.state import SessionState

from .schema import EvidenceContext, EvidenceEvent, Expect, Scenario, Turn

REDACTED = "[redacted]"


def _source_revision() -> tuple[str | None, bool | None]:
    root = Path(__file__).resolve().parents[3]
    if not (root / ".git").exists():
        return None, None
    try:
        commit = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
            check=True,
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"],
            capture_output=True,
            text=True,
            timeout=2,
            check=True,
        ).stdout
        return commit, bool(dirty)
    except (OSError, subprocess.SubprocessError):
        return None, None


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
                        self._remember(patch.evidence)
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
        if isinstance(value, str) and value:
            self.tokens.update(
                (
                    value,
                    repr(value)[1:-1],
                    json.dumps(value, ensure_ascii=False)[1:-1],
                    json.dumps(value, ensure_ascii=True)[1:-1],
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
        return self.clean(output)

    def context(self) -> EvidenceContext:
        try:
            package_version = version("libretto-voice")
        except PackageNotFoundError:
            package_version = None
        commit, dirty = _source_revision()
        workflow = self.compiled.workflow
        return EvidenceContext(
            workflow_sha256=self.compiled.source_hash,
            workflow_id=self.clean(workflow.id),
            start_stage=workflow.start,
            yaml_schema_version=workflow.version,
            libretto_version=package_version,
            libretto_commit=commit,
            source_dirty=dirty,
            models=self.clean(workflow.models.model_dump()),
            speech=self.clean(workflow.speech.model_dump()),
            redacted_fields=sorted(self.fields),
        )

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
                allowed = {"source", "destination", "edge", "node", "policy", "code", "reason"}
                details = {key: value for key, value in data.items() if key in allowed}
                if data.get("request_id"):
                    details["request"] = requests.get(data["request_id"], "no-request")
            else:
                continue
            output.append(
                EvidenceEvent(
                    sequence=len(output) + 1, type=event.type, epoch=event.epoch, details=self.clean(details)
                )
            )
        return output
