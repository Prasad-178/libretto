"""Typed session data; credentials deliberately do not belong here."""

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import Field

from libretto.schema import StrictModel


class FactPatch(StrictModel):
    value: str | bool | None = None
    evidence: str
    status: Literal["answered", "declined", "conflicting"] = "answered"


class Evaluation(StrictModel):
    updates: dict[str, FactPatch] = Field(default_factory=dict)
    matches: list[str] = Field(default_factory=list)
    reason: str = ""
    control: Literal["continue", "cancel_request", "end_call", "stop_talking"] = "continue"


class ToolResult(StrictModel):
    status: str
    data: dict[str, Any] = Field(default_factory=dict)


@dataclass
class Fact:
    value: str | bool | None
    status: str
    evidence: str
    turn_id: str


@dataclass
class Message:
    role: str
    content: str
    turn_id: str
    interrupted: bool = False


@dataclass(frozen=True)
class Passage:
    source: str
    document: str
    heading: str
    chunk_id: str
    content_hash: str
    text: str
    score: float


@dataclass(frozen=True)
class StageSnapshot:
    stage: str
    revision: int
    epoch: int
    facts: dict[str, Any]
    history: tuple[Message, ...]


@dataclass(frozen=True)
class GenerationContext:
    turn_id: str
    text: str
    snapshot: StageSnapshot
    system: str
    passages: tuple[Passage, ...] = ()
    fields: dict[str, Any] = field(default_factory=dict)
    conditions: dict[str, str] = field(default_factory=dict)


EvaluationContext = GenerationContext


@dataclass
class SessionState:
    active_stage: str
    pending_stage: str | None = None
    revision: int = 0
    facts: dict[str, Fact] = field(default_factory=dict)
    history: list[Message] = field(default_factory=list)
    receipts: list[dict[str, Any]] = field(default_factory=list)
    readback_fingerprint: str | None = None
    transfer_outcome: str = "unavailable"

    def values(self) -> dict[str, Any]:
        return {key: fact.value for key, fact in self.facts.items() if fact.status == "answered"}


DETAIL_FIELDS = ("recipient", "caller_name", "callback_number", "message")


def details_fingerprint(values: dict[str, Any]) -> str | None:
    if not all(values.get(key) for key in DETAIL_FIELDS):
        return None
    encoded = json.dumps({key: values[key] for key in DETAIL_FIELDS}, sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()
