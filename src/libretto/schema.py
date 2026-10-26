"""Strict, bounded YAML configuration. Loading configuration never imports code."""

from pathlib import Path
from typing import Any, Literal, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class FieldSpec(StrictModel):
    type: Literal["string", "boolean"] = "string"
    description: str = ""
    choices: list[str] = Field(default_factory=list)

    def validate_value(self, value: Any) -> str | bool:
        expected = str if self.type == "string" else bool
        if type(value) is not expected:
            raise ValueError(f"Expected {self.type}")
        if isinstance(value, str):
            value = value.strip()
            if len(value) > 2000:
                raise ValueError("Fact exceeds 2000 characters")
            if self.choices and value not in self.choices:
                raise ValueError("Fact is outside configured choices")
        return value


class Predicate(StrictModel):
    op: Literal["equals", "exists", "all", "any", "not"]
    field: str | None = None
    value: str | bool | None = None
    conditions: list["Predicate"] = Field(default_factory=list)

    @model_validator(mode="after")
    def shape(self) -> Self:
        if self.op in ("equals", "exists") and not self.field:
            raise ValueError("Predicate requires field")
        if self.op in ("all", "any") and not self.conditions:
            raise ValueError("Predicate requires conditions")
        if self.op == "not" and len(self.conditions) != 1:
            raise ValueError("not requires exactly one condition")
        return self

    def matches(self, facts: dict[str, Any]) -> bool:
        if self.op == "equals":
            return facts.get(self.field) == self.value
        if self.op == "exists":
            return facts.get(self.field) not in (None, "", False)
        if self.op == "all":
            return all(c.matches(facts) for c in self.conditions)
        if self.op == "any":
            return any(c.matches(facts) for c in self.conditions)
        return not self.conditions[0].matches(facts)


class Edge(StrictModel):
    id: str
    to: str
    condition: str = ""
    predicate: Predicate | None = None
    result: str | None = None
    timing: Literal["next_response", "before_action"] = "next_response"


class Node(StrictModel):
    kind: Literal["conversation", "action", "say", "end"]
    title: str = ""
    prompt: str = ""
    text: str = ""
    tools: list[str] = Field(default_factory=list)
    knowledge: list[str] = Field(default_factory=list)
    tool: str | None = None
    requires: list[str] = Field(default_factory=list)
    arguments: dict[str, str] = Field(default_factory=dict)
    edges: list[Edge] = Field(default_factory=list)
    patient: bool = False
    entry: Literal["wait", "respond"] = "wait"

    @model_validator(mode="after")
    def node_shape(self) -> Self:
        if self.kind == "action" and not self.tool:
            raise ValueError("Action requires a registered tool")
        if self.kind == "say" and not self.text:
            raise ValueError("Say node requires text")
        if self.kind != "end" and not self.edges:
            raise ValueError("Nonterminal node needs outgoing edges")
        if len({e.id for e in self.edges}) != len(self.edges):
            raise ValueError("Duplicate edge IDs")
        return self


class Models(StrictModel):
    speaker: str = "google/gemini-3.5-flash"
    evaluator: str = "google/gemini-3.5-flash"
    reasoning: Literal["minimal", "low", "medium", "high"] = "minimal"


class SpeechEndpoint(StrictModel):
    provider: str = Field(default="deepgram", min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    model: str = Field(min_length=1, max_length=100)


class Speech(StrictModel):
    stt: SpeechEndpoint = Field(default_factory=lambda: SpeechEndpoint(model="flux-general-en"))
    tts: SpeechEndpoint = Field(default_factory=lambda: SpeechEndpoint(model="flux-haley-en"))
    hints: list[str] = Field(default_factory=list, max_length=64)

    @model_validator(mode="after")
    def bounded_hints(self) -> Self:
        if any(not hint.strip() or len(hint) > 100 for hint in self.hints):
            raise ValueError("Speech hints must contain 1-100 characters")
        return self


class Workflow(StrictModel):
    version: Literal[1]
    id: str
    name: str
    description: str = ""
    start: str
    shared_prompt: str
    fields: dict[str, FieldSpec] = Field(default_factory=dict)
    tools: list[str] = Field(default_factory=list)
    knowledge: dict[str, str] = Field(default_factory=dict)
    common_knowledge: list[str] = Field(default_factory=list)
    models: Models = Field(default_factory=Models)
    speech: Speech = Field(default_factory=Speech)
    nodes: dict[str, Node]

    @model_validator(mode="after")
    def references(self) -> Self:
        if not self.nodes or len(self.nodes) > 64 or len(self.fields) > 64:
            raise ValueError("Workflow must contain 1-64 nodes and at most 64 fields")
        if self.start not in self.nodes:
            raise ValueError(f"Unknown start node {self.start}")
        for source in self.common_knowledge:
            if source not in self.knowledge:
                raise ValueError(f"Unknown knowledge {source}")
        for node_id, node in self.nodes.items():
            for tool in node.tools + ([node.tool] if node.tool else []):
                if tool not in self.tools:
                    raise ValueError(f"Unknown tool {tool} at {node_id}")
            for source in node.knowledge:
                if source not in self.knowledge:
                    raise ValueError(f"Unknown knowledge {source} at {node_id}")
            for field in node.requires + list(node.arguments.values()):
                if field not in self.fields:
                    raise ValueError(f"Unknown field {field} at {node_id}")
            for edge in node.edges:
                if edge.to not in self.nodes:
                    raise ValueError(f"Unknown destination {edge.to} at {node_id}")
                if edge.predicate:
                    self._check_predicate(edge.predicate, 0)
        reached, pending = set(), [self.start]
        while pending:
            current = pending.pop()
            if current not in reached:
                reached.add(current)
                pending.extend(e.to for e in self.nodes[current].edges)
        if reached != set(self.nodes):
            raise ValueError(f"Unreachable nodes: {sorted(set(self.nodes) - reached)}")
        return self

    def _check_predicate(self, predicate: Predicate, depth: int) -> None:
        if depth > 8:
            raise ValueError("Predicate nesting exceeds 8")
        if predicate.field and predicate.field not in self.fields:
            raise ValueError(f"Unknown predicate field {predicate.field}")
        for child in predicate.conditions:
            self._check_predicate(child, depth + 1)


class UniqueLoader(yaml.SafeLoader):
    pass


def _mapping(loader: UniqueLoader, node: yaml.MappingNode):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=True)
        if key in result:
            raise ValueError(f"duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node, deep=True)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)


def load_workflow(path: Path) -> Workflow:
    return parse_workflow(path.read_text())


def parse_workflow(text: str) -> Workflow:
    if len(text.encode()) > 100_000:
        raise ValueError("Workflow exceeds 100 KB")
    depth = 0
    try:
        for token in yaml.scan(text):
            if isinstance(token, (yaml.AliasToken, yaml.AnchorToken)):
                raise ValueError("YAML aliases and anchors are not supported")
        for event in yaml.parse(text):
            if isinstance(event, (yaml.MappingStartEvent, yaml.SequenceStartEvent)):
                depth += 1
                if depth > 20:
                    raise ValueError("YAML nesting exceeds 20")
            elif isinstance(event, (yaml.MappingEndEvent, yaml.SequenceEndEvent)):
                depth -= 1
        return Workflow.model_validate(yaml.load(text, Loader=UniqueLoader))
    except yaml.YAMLError as exc:
        raise ValueError("Invalid YAML") from exc
