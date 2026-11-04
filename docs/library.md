# Using Libretto in an application

[README](../README.md) · [Request-policy migration](migrations/request-policies.md) · [Roadmap](../ROADMAP.md)

Libretto compiles YAML against tools registered by your Python application. `WorkflowRunner` owns one session using the existing execution engine. Your application owns providers, credentials, external side effects and deployment. Studio is optional.

## Install from source

Python 3.12+ is required. No package-registry release is published. For development:

```sh
git clone https://github.com/Prasad-178/libretto.git
cd libretto
uv venv
uv pip install -e .
```

For a reproducible Git install, replace `YOUR_VERIFIED_COMMIT` below with an actual reviewed commit once this branch is merged/released. This is an explicit placeholder, not a release tag:

```sh
uv pip install 'libretto-voice @ git+https://github.com/Prasad-178/libretto.git@YOUR_VERIFIED_COMMIT'
```

Core dependencies are Pydantic and PyYAML. `.[providers]` adds HTTP support for the bundled OpenRouter adapter. `.[studio]` adds the server and browser speech dependencies. The core wheel contains Python modules, not the repository's example files or built Studio assets. A repository checkout, `uv sync --locked`, `npm --prefix web ci` and `npm --prefix web run build` are the supported Studio setup. Run `uv run libretto serve` from that checkout; open `/studio`.

The repository license remains an owner decision before a reusable release; public source availability does not itself grant a license.

## Compile and run

```python
import asyncio
from pathlib import Path
from libretto import (
    Evaluation, ParameterSpec, ToolDefinition, ToolRegistry, ToolResult,
    WorkflowRunner, compile_workflow,
)

async def book_visit(arguments, context):
    # Forward context.idempotency_key to a real service in your own application.
    return ToolResult(status="booked", data={"receipt": "fictional-1"})

tools = ToolRegistry()
tools.register(ToolDefinition(
    "book_visit",
    tuple(ParameterSpec(name, "string") for name in
          ("customer_name", "address", "issue", "window")),
    ("booked", "failed", "unknown"),
), book_visit)
root = Path("examples/repair_visit")
compiled = compile_workflow((root / "agent.yaml").read_text(),
                            tools=tools, project_root=root)

# Supply implementations of Responder.stream_reply(context) and
# Evaluator.evaluate(context). The evaluator returns Evaluation proposals;
# the runtime validates them and owns confirmation/action authority.
async def run(responder, evaluator):
    runner = WorkflowRunner(compiled, responder=responder, evaluator=evaluator)
    async def output():
        async for event in runner.events():
            print(event.type, event.data)
    output_task = asyncio.create_task(output())
    try:
        await runner.start()
        await runner.submit("I'd like to arrange a visit", turn_id="caller-1")
        # Continue submitting final turns with distinct stable IDs.
        # snapshot() returns detached state for inspection.
    finally:
        await runner.close()
        await output_task
```

This snippet wires the application; it is not a scripted full conversation. For deterministic complete scenarios see [repair tests](../tests/test_repair_visit.py) and [public API tests](../tests/test_public_api.py). The [repair stub](../examples/repair_visit/tools.py) generates different fictional receipts per request. [Northline](../examples/receptionist.yaml) uses explicit [demo registrations](../src/libretto/demo_tools.py). Neither example contacts real businesses.

## Public surface and lifecycle

Supported root imports: `compile_workflow`, `CompiledWorkflow`, `CompileIssue`, `WorkflowCompileError`, `WorkflowRunner`, `ToolRegistry`, `ToolDefinition`, `ParameterSpec`, `ToolHandler`, `ActionContext`, `ToolResult`, `Responder`, `Evaluator`, `Evaluation`, `GenerationContext`, `ServerEvent`. Other modules are implementation details unless separately documented.

- `await runner.start()` is idempotent. `submit(text, turn_id=...)` starts if necessary; duplicate final-turn IDs are ignored within the session. Use one event consumer and submit turns sequentially after the transport commits input. Speculative STT remains an internal browser adapter concern.
- `runner.events()` yields detached events. In text mode, consuming `response_done` acknowledges that text through the transport. Consume output before asking for approval of a readback; merely generating it grants no permission.
- With `delivery_mode="external"`, call `acknowledge_delivery(message_id, epoch=..., completed=True)` only after complete output delivery. A generated response, enqueued TTS or transcript is not evidence. Wrong/stale/interrupted acknowledgements raise `ConfirmationBlocked` from `libretto.confirmation`. Report partial delivery with `completed=False`, or interrupt; the readback cannot authorize an action. A subsequent turn at the confirmation step can issue a fresh tagged readback, followed by a separate approval turn. `require_delivery: false` explicitly waives the delivery requirement; an actual partial/interrupted delivery still invalidates its permit.
- `await runner.interrupt()` invalidates pending output/transition work. `close()` is idempotent and ends the event stream. Keep consuming during use so bounded event buffers do not apply backpressure indefinitely.
- Workflow, retrieval and registration snapshots are detached at runner construction; state/event mutations by callers cannot edit a running session. Handler callbacks remain application-owned: their intentional external state and service clients are not deep-copied. Do not mutate handler behavior while running.

## Compilation and execution limits

Compilation performs strict bounded YAML loading, request/policy/reference checks, required argument and type checks, tool/result coverage and contained Markdown indexing. Every declared tool outcome needs exactly one action-result route; executable tools declare `failed` and `unknown`. Errors contain ordered path/code/message issues. It never imports handlers named by YAML.

The CLI's `validate` uses the same compiler. It has no custom handler import mechanism: the default bundled workflow registers demo tools; explicit files use an empty registry unless `--demo-tools` is selected. Validate application-specific tools with `compile_workflow` in application code, and compose a local Studio app with `create_app(workflow_path=..., project_root=..., tool_factory=...)` from `libretto.server` (requires Studio extra). The hosted demo rejects unregistered imported tools. Source inspection uses the same contained compiler and cannot read arbitrary folders.

Limits: 100,000 Unicode characters, 64 nodes, 64 fields, 256 transitions; existing nesting bounds remain. One active request per session; no parallel or nested requests. Provider credentials stay in application configuration, never YAML or exports.

Action identities bind session, request and action-node IDs, with an argument fingerprint. Reentry reports already-completed instead of dispatching or replaying a success as fresh work. Changed arguments require a new request. Exceptions/cancellation after dispatch yield an uncertain `unknown` outcome; there is no automatic retry or rollback. Late callbacks retain historical identity without advancing the current request. Applications must use durable downstream idempotency where required: Libretto only tracks executions in process/session memory.

LLM understanding is probabilistic. Deterministic tests prove guard/lifecycle behavior, not language understanding, voice quality or real-world delivery. M1 remains usable alone. The optional LiveKit dependency supplies the default voice engine in the current migration; see [LiveKit](livekit.md) for credential modes, custom IO and verification limits.
