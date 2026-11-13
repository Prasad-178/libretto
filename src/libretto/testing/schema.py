"""Versioned offline test data. Scenario files never load Python handlers."""

from pathlib import Path
from typing import Annotated, Any, Literal, Self

import yaml
from pydantic import Field, StringConstraints, model_validator

from libretto.schema import StrictModel, UniqueLoader
from libretto.state import Evaluation, ToolResult

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text = Annotated[str, StringConstraints(min_length=1, max_length=8000)]


class SimulatedTool(StrictModel):
    parameters: dict[str, Literal["string", "boolean"]] = Field(default_factory=dict)
    results: list[Name] = Field(min_length=1, max_length=100)
    responses: list[ToolResult] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_results(self) -> Self:
        if len(set(self.results)) != len(self.results):
            raise ValueError("Tool results must be unique")
        if any(response.status not in self.results for response in self.responses):
            raise ValueError("Scripted responses must use declared tool results")
        return self


class Turn(StrictModel):
    kind: Literal["turn"]
    id: Name
    text: Text
    evaluation: Evaluation

    @model_validator(mode="after")
    def nonempty_text(self) -> Self:
        if not self.text.strip():
            raise ValueError("Turn text must not be blank")
        return self


class Deliver(StrictModel):
    kind: Literal["deliver"]
    policy: Name
    completed: bool = True


class Interrupt(StrictModel):
    kind: Literal["interrupt"]


class Advance(StrictModel):
    kind: Literal["advance"]
    seconds: float = Field(ge=0, le=300)


class Expect(StrictModel):
    kind: Literal["expect"]
    stage: Name | None = None
    facts: dict[str, str | bool | None] = Field(default_factory=dict)
    absent_facts: list[Name] = Field(default_factory=list)
    action_count: int | None = Field(default=None, ge=0)
    action_results: list[str] | None = None
    request: Name | None = None

    @model_validator(mode="after")
    def has_assertions(self) -> Self:
        if not self.model_fields_set - {"kind"}:
            raise ValueError("A checkpoint needs at least one assertion")
        return self


Step = Annotated[Turn | Deliver | Interrupt | Advance | Expect, Field(discriminator="kind")]


class Scenario(StrictModel):
    version: Literal[1]
    name: Name
    workflow: Name
    tools: dict[str, SimulatedTool] = Field(default_factory=dict)
    reply: Annotated[str, StringConstraints(min_length=1, max_length=4000)] = "Scripted response."
    steps: list[Step] = Field(min_length=1, max_length=200)
    expected_codes: list[Name] = Field(default_factory=list)
    expected_stages: list[Name] | None = None
    completed: bool | None = None

    @model_validator(mode="after")
    def unique_turns(self) -> Self:
        ids = [step.id for step in self.steps if isinstance(step, Turn)]
        if len(ids) != len(set(ids)):
            raise ValueError("Scenario turn IDs must be unique")
        return self


class ScenarioReport(StrictModel):
    name: str
    passed: bool
    failures: list[str]
    stages: list[str]
    facts: dict[str, Any]
    actions: list[dict[str, Any]]
    codes: list[str]
    completed: bool


def load_scenario(path: Path) -> Scenario:
    """Read bounded YAML or JSON with duplicate-key and alias rejection."""
    text = path.read_text(encoding="utf-8")
    if len(text) > 100_000:
        raise ValueError("Scenario exceeds 100,000 characters")
    try:
        depth = 0
        for token in yaml.scan(text):
            if isinstance(token, (yaml.AliasToken, yaml.AnchorToken)):
                raise ValueError("Scenario aliases and anchors are not supported")
        for event in yaml.parse(text):
            if isinstance(event, (yaml.MappingStartEvent, yaml.SequenceStartEvent)):
                depth += 1
                if depth > 20:
                    raise ValueError("Scenario nesting exceeds 20")
            elif isinstance(event, (yaml.MappingEndEvent, yaml.SequenceEndEvent)):
                depth -= 1
        return Scenario.model_validate(yaml.load(text, Loader=UniqueLoader))
    except yaml.YAMLError as error:
        raise ValueError("Invalid scenario YAML") from error
