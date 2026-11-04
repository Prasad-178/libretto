# Reusable Libretto core specification

Status: implemented on the local M1 feature branch (2026-11-04), reviewed and locally verified, pending merge/release. The APIs and YAML extensions below are not yet released. [Product charter](../../product-direction.md) · [Roadmap](../../../ROADMAP.md).

## Outcome and boundary

Northline and a fictional repair-visit agent run on the same Python core, with different fields, confirmation rules and registered application tools. A developer can install from GitHub and run a text scenario without Studio, FastAPI, LiveKit, the demo directory or a Libretto service.

Reuse the existing Session and responder/evaluator protocols. Do not rewrite speech delivery or create a second runtime. Existing browser voice transport remains supported. LiveKit is M2 and is optional.

## Global constraints

- Libretto is an OSS developer tool; Studio is only a visual editor, visualization, testing, and debugging companion.
- No accounts, billing, subscriptions, organizations, collaboration, shared workspaces, or managed hosted product.
- Python >=3.12; preserve the existing `libretto` import namespace and `libretto-voice` distribution name.
- Distribution through GitHub/source installs only; no package-registry publication.
- YAML is the executable source of truth; Studio sidecars affect presentation only.
- Credentials never enter YAML, sidecars, persisted drafts, traces, or exports.
- Keep workflow bounds: 100,000 Unicode characters, 64 nodes, 64 fields, 256 transitions, existing nesting limits.
- CI uses deterministic adapters and no paid inference. Real-provider checks require deliberate opt-in.
- Preserve source text on unrelated edits, route identities, and stationary canvas selection.

## Tool contracts

Create `tool_contracts.py` with frozen `ParameterSpec(name: str, type: Literal["string", "boolean"], required: bool = True)`, `ToolDefinition(name: str, parameters: tuple[ParameterSpec, ...], results: tuple[str, ...])`, and `ActionContext(session_id: str, request_id: str, idempotency_key: str)`.

An application handler has signature `async def handler(arguments: dict[str, str | bool], context: ActionContext) -> ToolResult`. Keep initial parameter types aligned with existing fields; nested objects, arbitrary JSON Schema and dynamically imported handlers are out of scope.

The registry supports `register(definition: ToolDefinition, handler: ToolHandler) -> None`, rejects duplicate names, exposes the existing manifest shape, and snapshots its registrations for compilation. Core imports never load `examples/directory.json` or register demo tools automatically. Move Northline implementations to `demo_tools.py`; only the demo/server composition layer constructs them.

Compilation validates registered tools, parameter names/types, required argument coverage, mapped facts included in `requires`, declared results and result-edge coverage. Require `failed` and `unknown` outcomes for executable application tools; migrate demo tools accordingly. Timeout/exception handling returns a declared safe outcome, never an implicit retry or a claimed success. Extra/unknown mappings are errors.

For each declared result exactly one action-result route must exist. Legacy fixtures needing migration get actionable diagnostics; do not silently route an unknown result to an arbitrary first edge. App handlers can return `failed`; a timeout/cancellation after possible dispatch is `unknown` unless the handler proves non-dispatch. No automatic retry of an unknown outcome.

## YAML extensions and migration

Keep schema version 1 with additive, explicit fields; existing simple unguarded workflows remain valid. Northline's prior implicit protections must be migrated to explicit rules atomically, not temporarily removed.

New root properties:

- `requests: dict[str, RequestSpec]`; each RequestSpec has `fields: list[str]` containing request-local facts. Other facts are session-local. A request-local field belongs to only one request definition.
- `confirmations: dict[str, ConfirmationSpec]`; each policy has `request: str`, `fields: list[str]`, `acceptance_field: str`, optional `consent_field: str | None`, and `require_delivery: bool = true`. Acceptance/consent fields must be boolean and request-local. All protected fields must belong to that request.
- `evaluation_prompt: str = ""`, bounded to 5,000 characters; workflow-specific extraction/consent interpretation guidance supplied to the evaluator. It cannot bypass runtime guards.

New optional node properties:

- `begin_request: str | None` explicitly begins a fresh request on committed entry, including entry as the workflow's start node. Re-entering that node intentionally begins another request; correction loops must target another node.
- `confirmation: str | None` associates a conversation readback or action with one named policy. A confirmation readback requires `kind: conversation`, `entry: respond`, a `readback` template, and policy-compatible fields. An action using the policy must have its mapped required facts available within the same active request.

For Northline, use one `front_desk` request scope covering the transfer-to-message fallback; both confirmation policies can reference that same scope. Starting another enquiry through the explicit request-entry node resets it. Do not assign the same recipient field to two overlapping request scopes.

Do not infer policy from node names, tool names, prompt wording or punctuation. Unsupported combinations fail compilation. Do not expose executable Python/import paths through YAML.

## Request lifecycle

`RequestState` holds an opaque request ID, configured request name and completion/cancellation status. Session identity is distinct from request identity and generation epoch.

On an explicit new request: invalidate pending transitions/work from the old request, clear request-local facts/consent/confirmation/readback permits, retain session-local facts, and create a fresh action scope. Retain old receipts as historical evidence with their original request IDs; never return them as current execution results.

A request starts only through `begin_request`. Re-entering ordinary collection/correction stages does not clear it. Cancel/end invalidates its permissions and pending dispatch. Starting another named request cancels the prior active request; parallel/nested requests are out of scope.

The first M1 implementation has one active request per session. Tools requiring a policy cannot run before that policy's request has begun.

## Confirmation and delivery

`confirmation.py` owns the generic policy/state transitions. A readback fingerprint includes policy ID, request ID and canonical values for all protected fields. Missing/declined/conflicting required facts cannot produce a valid fingerprint. Confirmation validity also binds the actual readback message ID and generation epoch.

A runtime-issued readback becomes eligible for acceptance only after complete delivery is acknowledged for that message/current request. A later user turn can propose acceptance. A field correction, explicit refusal/cancellation, interrupted readback, new request or stale epoch invalidates permission.

A single evaluator proposal that changes protected details and says “confirmed” cannot authorize the changed details. Deliver the new readback and accept it on a subsequent turn. Consent remains an explicitly configured separate condition when present.

Internal carrier types: `ConfirmationState(policy_id: str, request_id: str, fingerprint: str, message_id: str, epoch: int, delivered: bool = False, accepted_turn_id: str | None = None)` and `DeliveryAck(message_id: str, epoch: int, completed: bool)`. Policy functions receive the current request identity and this state, rather than trusting identities supplied only in a transport payload.

Use the explicit message/fingerprint binding regardless of punctuation or language. Do not turn “ends in ?” into a safety condition. Any legacy untagged heuristics must never authorize a new guarded action.

Delivery capability is explicit. Local text mode records a text-delivery acknowledgement through its transport; fake tests can acknowledge it directly. Voice requires output delivery evidence, not an STT transcript, generated text, TTS enqueue or first audio. Adapters that cannot establish this must reject delivery-gated actions with a capability diagnostic.

## Action identity and limits

Use stable keys derived from session ID + request ID + action node ID. Preserve an argument fingerprint with execution state. Re-entering an already executed action in that request returns an explicit already-completed state, not another success receipt masquerading as new work. Changed arguments after an executed/unknown action require a new explicit request; do not silently generate another key and retry.

Provide the key to the developer's handler so it can use a downstream idempotency mechanism. Libretto's process/session-local tracking is not durable exactly-once execution. No database, hosted action queue or process-restart recovery is introduced.

A callback finishing after cancellation may still represent a real external side effect. Retain/report its outcome with original identity, but do not advance the newer workflow or speak a success in the new request. Handler cancellation alone cannot prove an external action was undone.

## Generic evaluator context

Remove recipient/message/phone/directory-specific interpretation from the core OpenRouter evaluator prompt. Provide configured field descriptions, current stage/allowed routes, active request/policy summaries and `evaluation_prompt` to the existing evaluator protocol. Application context may be supplied explicitly; no implicit demo-directory dependency.

Language evidence still needs current-turn provenance/type checks. Semantic interpretation is not proven by string containment. Existing precedence of deterministic predicates, then semantic matches, and YAML ordering remains unchanged.

## Compiler and public facade

Create `compiler.py`:

- `compile_workflow(source: str, *, tools: ToolRegistry, project_root: Path | None = None) -> CompiledWorkflow`.
- `CompiledWorkflow` contains the validated workflow, canonical source hash, scoped retrieval index and a snapshot of tool registrations. No mutable caller-owned object can change an already-started runner.
- `WorkflowCompileError` contains ordered `CompileIssue(path: tuple[str | int, ...], code: str, message: str)` diagnostics for the API/CLI/Studio.

Create `api.py` and export only the intended facade from `__init__.py`:

- `WorkflowRunner(compiled: CompiledWorkflow, *, responder: Responder, evaluator: Evaluator, delivery_mode: Literal["text", "external"] = "text")`.
- `await runner.start()`, `await runner.submit(text: str, *, turn_id: str)`, `runner.events() -> AsyncIterator[ServerEvent]`, `await runner.acknowledge_delivery(message_id: str, *, epoch: int, completed: bool)`, `await runner.interrupt()`, `await runner.close()`.
- `runner.snapshot()` returns a detached snapshot, not the live mutable SessionState.

The facade owns lifecycle/acknowledgement consistency and delegates to one Session. External mode is reserved for a caller that supplies verified delivery events. Do not automatically select it merely because LiveKit is installed.

Bare core import does not import server, FastAPI, Studio or speech provider modules. Keep old internal imports working during migration where possible; document the new supported import surface. Move server-only dependencies to an optional Studio extra only after a clean core import proves the separation.

## Second workflow

Create `examples/repair_visit/agent.yaml`, a small Markdown policies folder and a deterministic `book_visit` Python stub. Fields include customer name, service address, issue summary, visit window, booking consent and acceptance. No Northline recipient/message/callback fields are used.

The stub returns `booked`, `failed` or `unknown`, creates distinct fictional receipts for different request IDs and accepts an idempotency key. It does not call a real scheduling service, send messages or create appointments.

Include scenarios for normal booking, corrected address, interrupted readback, refusal, repeated identical booking requests, delayed callback after cancellation, failed booking and unknown outcome. Northline gets equivalent request/confirmation regression coverage using its migrated configuration.

## Studio and compatibility

M1 does not redesign Studio. Extend workflow types and diagnostics so policies/requests survive open/edit/export. Initially edit advanced policy declarations in YAML; inspectors can show their policy IDs and blocked reasons without needing a full policy builder.

Use the same compiler/tool manifests in CLI and Studio validation/start. Keep hosted folder restrictions and explicit local project roots. An arbitrary imported YAML file cannot register executable handlers. A local developer chooses the registry in application code.

## Completion gate

Two action workflows, one core, no business-specific branch in core/provider modules. All invalid contracts reject before execution. Clean Git/source installation outside the checkout works without a Libretto service, Studio or LiveKit. Runtime, compiler and compatibility tests pass; current frontend/API/browser checks remain green. Record known limits, schema migration and installation evidence in the milestone report.
