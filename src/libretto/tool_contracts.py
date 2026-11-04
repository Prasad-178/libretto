"""Application-supplied contracts; no tool code is loaded from YAML."""

from dataclasses import dataclass
from typing import Literal, Protocol

from libretto.state import ToolResult


@dataclass(frozen=True)
class ParameterSpec:
    name: str
    type: Literal["string", "boolean"]
    required: bool = True

    def __post_init__(self) -> None:
        if type(self.required) is not bool:
            raise ValueError("Parameter required must be a boolean")
        if not isinstance(self.name, str) or not self.name.strip():
            raise ValueError("Parameter needs a nonempty name")
        if self.type not in {"string", "boolean"}:
            raise ValueError("Unsupported tool parameter type")


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    parameters: tuple[ParameterSpec, ...]
    results: tuple[str, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "parameters", tuple(self.parameters))
        object.__setattr__(self, "results", tuple(self.results))
        if not self.name or len({p.name for p in self.parameters}) != len(self.parameters):
            raise ValueError("Tool needs a name and unique parameters")
        if any(not p.name or p.type not in {"string", "boolean"} for p in self.parameters):
            raise ValueError("Unsupported tool parameter")
        if any(not isinstance(result, str) or not result.strip() for result in self.results):
            raise ValueError("Tool result statuses must be nonempty strings")
        if not self.results or len(set(self.results)) != len(self.results):
            raise ValueError("Tool needs unique results")


@dataclass(frozen=True)
class ActionContext:
    session_id: str
    request_id: str
    idempotency_key: str


class ToolHandler(Protocol):
    async def __call__(self, arguments: dict[str, str | bool], context: ActionContext) -> ToolResult: ...
