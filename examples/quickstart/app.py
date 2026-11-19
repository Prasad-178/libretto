"""A core-only application with scripted inference and one fictional tool.

No credentials, model calls, web server or real support system are involved.
"""

import asyncio
import json
from pathlib import Path

from libretto import (
    Evaluation,
    ParameterSpec,
    ToolDefinition,
    ToolRegistry,
    ToolResult,
    WorkflowRunner,
    compile_workflow,
)


class ScriptedInference:
    """Treat this example's entire input as a summary, not general language understanding."""

    async def stream_reply(self, context):
        yield "I can record a fictional support request."

    async def evaluate(self, context):
        return Evaluation.model_validate({
            "updates": {"summary": {"value": context.text, "evidence": context.text}}
        })


def create_tools():
    tools = ToolRegistry()

    async def record_request(arguments, context):
        # Replace this stub with application code; use context.idempotency_key
        # with your downstream service if it supports durable deduplication.
        return ToolResult(status="recorded", data={
            "receipt": "fictional-request-1", "arguments": dict(arguments),
        })

    tools.register(ToolDefinition(
        name="record_request",
        parameters=(ParameterSpec("summary", "string"),),
        results=("recorded", "failed", "unknown"),
    ), record_request)
    return tools


async def run():
    project = Path(__file__).resolve().parent
    compiled = compile_workflow(
        (project / "workflow.yaml").read_text(), tools=create_tools(), project_root=project,
    )
    inference = ScriptedInference()
    runner = WorkflowRunner(compiled, responder=inference, evaluator=inference)

    async def consume():
        # Keep draining while the runner works. This also acknowledges text output;
        # a voice transport must acknowledge actual playback instead.
        async for _event in runner.events():
            pass

    consumer = asyncio.create_task(consume())
    try:
        async with asyncio.timeout(5):
            await runner.submit("Printer is jammed", turn_id="details")
            await runner.wait_idle()
        state = runner.snapshot()
        receipt = state.receipts[-1]
        print(json.dumps({
            "stage": state.active_stage, "tool": receipt["tool"],
            "status": receipt["status"], **receipt["data"],
        }))
    finally:
        await runner.close()
        await consumer


if __name__ == "__main__":
    asyncio.run(run())
