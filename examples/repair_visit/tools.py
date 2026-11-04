"""Developer-owned simulated booking. Never calls a scheduling service."""

from libretto.state import ToolResult
from libretto.tool_contracts import ActionContext, ParameterSpec, ToolDefinition
from libretto.tools import ToolRegistry


def create_tools(*, outcome: str = "booked") -> ToolRegistry:
    tools = ToolRegistry()
    receipts = {}

    async def book(arguments: dict, context: ActionContext) -> ToolResult:
        if context.idempotency_key not in receipts:
            receipts[context.idempotency_key] = ToolResult(
                status=outcome,
                data={"receipt": "repair-" + str(len(receipts) + 1), "simulated": True, **arguments},
            )
        return receipts[context.idempotency_key]

    tools.register(
        ToolDefinition(
            "book_visit",
            tuple(ParameterSpec(name, "string") for name in ["customer_name", "address", "issue", "window"]),
            ("booked", "failed", "unknown"),
        ),
        book,
    )
    return tools
