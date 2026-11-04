"""Explicit developer registrations. Construction and import perform no filesystem I/O."""

from dataclasses import asdict
from types import MappingProxyType

from libretto.schema import Workflow
from libretto.state import SessionState, ToolResult
from libretto.tool_contracts import ActionContext, ToolDefinition, ToolHandler


class ToolRegistry:
    def __init__(self) -> None:
        self._registrations: dict[str, tuple[ToolDefinition, ToolHandler]] = {}
        self._frozen = False

    @property
    def names(self) -> set[str]:
        return set(self._registrations)

    def register(self, definition: ToolDefinition, handler: ToolHandler) -> None:
        if self._frozen:
            raise ValueError("Tool registry is frozen")
        if definition.name in self._registrations:
            raise ValueError(f"Tool already registered: {definition.name}")
        self._registrations[definition.name] = (definition, handler)

    def snapshot(self) -> "ToolRegistry":
        frozen = ToolRegistry()
        frozen._registrations = MappingProxyType(dict(self._registrations))
        frozen._frozen = True
        return frozen

    def manifest(self) -> list[dict]:
        return [
            {
                "name": definition.name,
                "parameters": [asdict(p) for p in definition.parameters],
                "results": list(definition.results),
            }
            for definition, _ in self._registrations.values()
        ]

    def validate(self, workflow: Workflow) -> None:
        if unknown := set(workflow.tools) - self.names:
            raise ValueError(f"Unregistered tools: {sorted(unknown)}")

    async def execute(
        self,
        name: str,
        arguments: dict[str, str | bool],
        context: ActionContext | SessionState,
        key: str | None = None,
    ) -> ToolResult:
        """Validate and dispatch once; runtime owns deduplication and uncertainty.

        The four-argument SessionState form is retained for internal compatibility.
        Application handlers always receive the immutable ActionContext form.
        """
        if key is not None:
            request = getattr(context, "request", None)
            context = ActionContext(
                getattr(context, "session_id", "legacy"), getattr(request, "id", "legacy"), key
            )
        if not isinstance(context, ActionContext):
            raise TypeError("Tool execution requires an ActionContext")
        if name not in self._registrations:
            raise ValueError("Unregistered action")
        definition, handler = self._registrations[name]
        for parameter in definition.parameters:
            if parameter.required and parameter.name not in arguments:
                raise ValueError(f"Missing argument: {parameter.name}")
            if parameter.name in arguments and type(arguments[parameter.name]) is not (
                str if parameter.type == "string" else bool
            ):
                raise ValueError(f"Wrong argument type: {parameter.name}")
        if set(arguments) - {p.name for p in definition.parameters}:
            raise ValueError("Unknown tool argument")
        result = await handler(dict(arguments), context)
        if result.status not in definition.results:
            raise ValueError(f"Undeclared tool result: {result.status}")
        return result
