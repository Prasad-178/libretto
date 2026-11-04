# Reusable Libretto Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Native implementation is the preserved workflow for this project; do not create per-task implementation subagents.

**Goal:** Run Northline and a repair-visit agent through the same importable core, with explicit request/confirmation rules and compiled developer tool contracts.

**Architecture:** Evolve the existing Session through a small compiler/facade. Separate demo tools and interpretation guidance from reusable contracts. Studio and the existing browser transport consume that same core; LiveKit follows as a separate optional integration after this milestone.

**Tech Stack:** Python >=3.12, Pydantic 2, existing asyncio/provider protocols, PyYAML, pytest; existing React/TypeScript Studio for compatibility checks.

**Spec:** [Reusable core specification](../specs/2026-11-04-reusable-core.md). Product boundary: [product direction](../../product-direction.md).

## Global Constraints

- Libretto is an OSS developer tool; Studio is only a visual editor, visualization, testing, and debugging companion.
- No accounts, billing, subscriptions, organizations, collaboration, shared workspaces, or managed hosted product.
- Python >=3.12; preserve the existing `libretto` import namespace and `libretto-voice` distribution name.
- Distribution through GitHub/source installs only; no package-registry publication.
- YAML is the executable source of truth; Studio sidecars affect presentation only.
- Credentials never enter YAML, sidecars, persisted drafts, traces, or exports.
- Keep workflow bounds: 100,000 Unicode characters, 64 nodes, 64 fields, 256 transitions, existing nesting limits.
- CI uses deterministic adapters and no paid inference. Real-provider checks require deliberate opt-in.
- Preserve source text on unrelated edits, route identities, and stationary canvas selection.

## Review Focus

1. A late external action callback after request cancellation must retain historical identity without advancing the new request (Task 5).
2. Identical arguments in two distinct requests must require separate consent/confirmation and distinct action identities (Tasks 3–5).
3. An acknowledgement for the wrong message/request/epoch, including partially heard output, must not authorize an action (Task 4).
4. Developer mutation of a registry/definition/snapshot after compile/start must not change the running session (Tasks 2, 7).
5. Core import/installation outside the checkout must not depend on demo paths, server imports, Studio assets or LiveKit (Tasks 2, 7–8).

## File ownership and dependency map

| File/group | Responsibility |
| --- | --- |
| `schema.py` | Additive YAML request/policy/node definitions and structural bounds. |
| `tool_contracts.py`, `tools.py` | Application-facing tool definitions, handler context and generic registry. |
| `demo_tools.py` | Northline-only simulated behavior and directory access. |
| `requests.py`, `confirmation.py` | Request identity/reset rules and generic delivery-bound confirmation. |
| `compiler.py` | Cross-contract diagnostics, retrieval boundary, registry snapshot and definition hash. |
| `runtime.py`, `state.py` | Consume contracts in the existing execution engine; retain epoch/cancellation semantics. |
| `api.py`, `__init__.py` | Small supported runner facade; no UI/provider bootstrap. |
| `providers/openrouter.py`, `prompts.py` | Generic evaluator instruction assembly plus explicit workflow guidance. |
| `server.py`, `workspace.py`, `cli.py`, `speech.py` | Adapt existing composition/transport to the same compiler/runner. |
| `examples/repair_visit/`, migrated receptionist | Two complete domain examples with developer-registered tools. |
| `tests/support/`, targeted tests | Deterministic providers, event barriers, delivery and handler fixtures. |

Dependencies: 1 baseline → 2 tools → 3 request schema/state → 4 confirmations → 5 action lifecycle → 6 compiler/examples/evaluator → 7 facade/transport integration → 8 distribution/docs/final verification. Tasks 3–6 are a coordinated compatibility migration; intermediate feature commits must not deploy a half-migrated Northline.

## Execution discipline

Before execution, inspect current HEAD/CI/instructions and create an isolated feature worktree. Do not edit or stage existing untracked design/review files. Record progress and rulings in this plan's own ledger. Every task follows reproduce → fail → implement → pass → meaningful commit. Fix current regressions before broadening tests.

Do not implement M2 in this plan. The roadmap defines its feasibility gate. A completed M1 must be usable without any LiveKit work.

### Task 1: Pin current behavior and add deterministic lifecycle fixtures

**Files:** Create `tests/support/workflow_harness.py`, `tests/fixtures/repair_visit.yaml`, `tests/test_request_regressions.py`; modify `tests/test_runtime.py` only for shared helper adoption.

**Interfaces:** Produce `ScriptedResponder`, `ScriptedEvaluator`, `RecordingToolHandler`, and `drain_until(session, event_type, *, limit=200)` for later tests. Use asyncio.Event barriers, not real sleeps. A drain that reaches its event bound fails with the observed event types.

- [x] Read current Session, schema, tool registry, provider context and existing interruption/delivery tests; run the existing full baseline once and record the head/results.
- [x] Add harness tests asserting event-controlled evaluation order, a blocked handler until its barrier is released, and bounded failure for a non-completing session. Run `uv run pytest tests/test_request_regressions.py -q`; expect RED until helpers exist, then implement and expect PASS.
- [x] Reproduce `test_second_request_does_not_reuse_prior_confirmation_or_receipt` and `test_tagged_delivered_readback_does_not_depend_on_question_mark` through the actual existing Session/ToolRegistry. Expect failure on the current defect, or record a verified prior fix if current HEAD differs. Do not weaken assertions to fit the current result.
- [x] Keep tests for unimplemented request/policy syntax in later tasks; do not leave permanent xfails. If a new regression cannot pass in this commit, carry its exact failing test into its owner task and commit the passing harness separately.
- [x] Commit: `test: characterize request and readback lifecycle`.

### Task 2: Make tool registration generic and isolate demo implementations

**Files:** Create `src/libretto/tool_contracts.py`, `src/libretto/demo_tools.py`, `tests/test_tool_contracts.py`; modify `src/libretto/tools.py`, `src/libretto/server.py`, `tests/test_receptionist.py`, `tests/test_server.py`.

**Interfaces:** Produce the spec's `ParameterSpec`, `ToolDefinition`, `ActionContext` and `ToolHandler`; `ToolRegistry.register(definition, handler)`, `manifest()` and an immutable registration snapshot. Preserve a compatibility adapter for the existing runtime's execute call until Task 5 updates dispatch. Demo registry construction is explicit in the demo/server composition layer.

- [x] Write `test_register_unrelated_tool_and_manifest`, `test_duplicate_name_rejected`, `test_unknown_tool_never_calls_handler`, `test_registration_snapshot_survives_later_mutation`, and `test_core_registry_import_does_not_read_demo_directory`. Assert exact string/boolean parameter and result manifest shapes.
- [x] Run `uv run pytest tests/test_tool_contracts.py -q`; expect RED for missing generic registration. Implement the contracts and empty-by-default registry; move directory and Northline handlers to demo_tools without loosening their safeguards.
- [x] Update server factory/default demo composition and test fixtures to register demo handlers explicitly. Existing caller-provided registries remain supported.
- [x] Run `uv run pytest tests/test_tool_contracts.py tests/test_receptionist.py tests/test_server.py -q`; expect PASS and no unknown tool execution.
- [x] Commit: `refactor: separate application tools from demo behavior`.

### Task 3: Add explicit request-scoped configuration and state

**Files:** Create `src/libretto/requests.py`, `tests/test_requests.py`; modify `src/libretto/schema.py`, `src/libretto/state.py`, `src/libretto/runtime.py`, `tests/test_schema.py`.

**Interfaces:** Produce `RequestSpec(fields: list[str])`, node `begin_request`, and `RequestState(id, name, status)`. `begin_request(state, name, spec) -> RequestState` creates a fresh ID and clears only configured request-local state. Session events/snapshots carry session/request identity in addition to epoch/revision.

- [x] Add schema tests for unknown request names/fields, a field belonging to multiple request scopes, and unchanged validation of the tiny survey.
- [x] Add `test_new_request_retains_session_facts_but_clears_request_permissions`, `test_correction_stage_keeps_request_id`, `test_start_node_begins_request_once`, `test_explicit_reentry_starts_distinct_request`, and `test_cancellation_rejects_old_pending_transition`.
- [x] Run `uv run pytest tests/test_requests.py tests/test_schema.py -q`; expect RED for missing request structures. Implement schema/state/lifecycle and retain old receipt history labelled with its request ID.
- [x] Assert entering a new request invalidates old pending generation/transition authority; ordinary stage changes do not reset the whole session. Starting a different request cancels the old one. End/close cannot create a new request accidentally.
- [x] Run targeted tests plus `tests/test_runtime.py`; expect PASS. Commit: `feat: scope workflow state to explicit requests`.

### Task 4: Replace domain-specific confirmation with delivery-bound policies

**Files:** Create `src/libretto/confirmation.py`, `tests/test_confirmation.py`; modify `schema.py`, `state.py`, `runtime.py`, `speech.py`, `examples/receptionist.yaml`, and receptionist/runtime tests.

**Interfaces:** Produce `ConfirmationSpec(request, fields, acceptance_field, consent_field=None, require_delivery=True)`, node `confirmation`, and generic policy state binding policy/request/field fingerprint/message/epoch. Use the spec's typed `ConfirmationState` and `DeliveryAck` carriers. Produce `confirmation_fingerprint(policy_id: str, request_id: str, values: dict, fields: list[str]) -> str | None`, `record_delivery(state: ConfirmationState, ack: DeliveryAck, *, current_request_id: str) -> ConfirmationState`, `accept_confirmation(state: ConfirmationState, *, current_request_id: str, current_fingerprint: str, turn_id: str, changed_fields: set[str]) -> ConfirmationState`, and `invalidate_confirmation(state: ConfirmationState) -> None` (returns no permit; the caller replaces its stored permit with that result). Define `ConfirmationBlocked(code: str, message: str)` as the typed exception for invalid/stale acceptance; do not partially mutate facts.

- [x] Add `test_readback_punctuation_does_not_change_explicit_delivery`, parameterized for `.`, `?`, newline and localized punctuation; `test_wrong_message_request_or_epoch_cannot_confirm`; `test_partial_delivery_cannot_confirm`; `test_correction_and_acceptance_same_turn_requires_new_readback`; `test_refusal_and_new_request_clear_permission`.
- [x] Run `uv run pytest tests/test_confirmation.py -q`; expect RED. Implement the generic policy module and route all existing readback/invalidation checks through it.
- [x] Migrate receptionist YAML to explicit request, transfer/message confirmation policies and node bindings in the same passing change. Remove core DETAIL_FIELDS, literal message_confirmed/destination_confirmed branches and punctuation authority. Keep legacy raw events compatible or document each necessary payload addition.
- [x] Have the existing browser speech coordinator report actual message/epoch delivery into the same policy boundary; no generated-text fallback in voice mode. Reject delivery-gated actions if the transport lacks that capability.
- [x] Run `uv run pytest tests/test_confirmation.py tests/test_requests.py tests/test_runtime.py tests/test_speech.py tests/test_receptionist.py -q`; expect PASS including the Task 1 regressions.
- [x] Commit: `feat: enforce generic request-bound confirmations`.

### Task 5: Bind actions to request identity and explicit outcomes

**Files:** Create `tests/test_action_lifecycle.py`; modify `runtime.py`, `state.py`, `tools.py`, `tool_contracts.py`, `demo_tools.py` and demo result routes.

**Interfaces:** Dispatch invokes `ToolHandler(arguments, ActionContext)`. Derive one idempotency key per session/request/action-node and store its argument fingerprint/status/result. Preserve the key across retries or re-entry inside the same request; new requests get new keys.

- [x] Write `test_identical_requests_have_distinct_action_keys`, `test_reentry_does_not_emit_prior_success_as_new_receipt`, `test_changed_arguments_after_dispatch_require_new_request`, `test_unknown_outcome_never_auto_retries`, and `test_late_callback_after_cancel_cannot_advance_new_request`.
- [x] In the late callback test hold the handler with an asyncio.Event, cancel/start another request, then release it; assert historical identity retained, no new-request transition/success speech, no second dispatch. No timing sleeps.
- [x] Run `uv run pytest tests/test_action_lifecycle.py -q`; expect RED. Implement generic dispatch/result tracking; reserve failed/unknown outcomes and map uncertain post-dispatch timeout/cancellation to unknown.
- [x] Migrate simulated transfer/capture result handling and assert current demo behavior still works. Do not claim durable exactly-once behavior or automatic rollback of external side effects.
- [x] Run action/request/confirmation/runtime/receptionist tests; expect PASS. Commit: `fix: bind action execution to request identity`.

### Task 6: Compile contracts and prove the second domain

**Files:** Create `src/libretto/compiler.py`, `tests/test_compiler.py`, `tests/test_repair_visit.py`, `examples/repair_visit/agent.yaml`, `examples/repair_visit/tools.py`, `examples/repair_visit/knowledge/policies.md`; modify `schema.py`, `prompts.py`, `providers/openrouter.py`, `workspace.py`, demo YAML and tool tests.

**Interfaces:** Produce `CompileIssue(path, code, message)`, `WorkflowCompileError(issues)`, `CompiledWorkflow`, and `compile_workflow(source, *, tools, project_root=None)`. Add bounded workflow `evaluation_prompt`; use it as domain guidance with generic runtime-enforced policy summaries.

- [x] Add compiler tests for missing/extra argument bindings, type mismatch, missing required facts, unknown policy/request/tool/result, cross-request protected fields, duplicate/missing outcome routes and unsupported policy-node shapes. Assert path/code diagnostics and zero handler calls.
- [x] Run `uv run pytest tests/test_compiler.py -q`; expect RED. Implement compilation over existing schema plus a frozen tool registration snapshot and the contained project retrieval boundary. Source hashing uses submitted UTF-8 bytes, preserving current source-fingerprint behavior.
- [x] Remove receptionist instructions from the shared OpenRouter evaluator prompt. Put domain rules in explicit example configuration/field descriptions; add a fake-model prompt-capture assertion that the repair prompt contains no injected Northline recipient/message rules.
- [x] Implement the repair workflow and deterministic book_visit stub from the spec. Test normal, corrected address, interrupted readback, refusal, repeated identical requests, failure and unknown results. Use distinct fictional receipts and no external side effects.
- [x] Run `uv run pytest tests/test_compiler.py tests/test_repair_visit.py tests/test_receptionist.py tests/test_openrouter.py tests/test_workspace.py -q`; expect PASS. Assert both workflows use the same core class and registry contract.
- [x] Commit: `feat: compile reusable workflows and add repair example`.

### Task 7: Expose the public runner and align CLI/Studio transports

**Files:** Create `src/libretto/api.py`, `tests/test_public_api.py`; modify `__init__.py`, `server.py`, `cli.py`, `studio_api.py`, `workspace.py`, `speech.py`, `web/src/workflow.ts`, policy-aware inspector/trace code where needed, and server/CLI tests.

**Interfaces:** Implement the spec's exact WorkflowRunner start/submit/events/acknowledge_delivery/interrupt/close/snapshot methods over one existing Session. Expose compile_workflow, WorkflowRunner and developer tool types from `libretto`. No core module imports FastAPI or Studio bootstrap.

- [x] Write `test_core_import_does_not_import_server_or_livekit`, `test_runner_uses_detached_compiled_snapshot`, `test_snapshot_mutation_does_not_change_session`, `test_duplicate_turn_and_close_are_idempotent`, `test_external_delivery_mode_rejects_stale_ack`, and `test_event_stream_finishes_on_close`.
- [x] Run `uv run pytest tests/test_public_api.py -q`; expect RED. Implement the facade, keeping a single lifecycle owner and detached state snapshots. Text transport acknowledges delivered text explicitly; external mode never auto-acknowledges speech.
- [x] Route CLI validation, Studio validation/start and source inspection through the same compilation boundary. Preserve hosted/local root restrictions, runtime model settings and injected registry behavior.
- [x] Extend frontend workflow types so request/policy declarations survive edits/export; show policy references and structured compiler diagnostics. Keep advanced policy editing in YAML for this milestone.
- [x] Add API/browser regressions for a malformed policy's path-specific error, an imported repair workflow retaining its declarations after prompt edit/export, and missing local handler rejection in the hosted demo.
- [x] Run public API/server/CLI/source tests, frontend unit/build and affected browser checks; expect PASS. Commit: `feat: expose the reusable runner across local tools`.

### Task 8: Verify clean Git distribution and document M1

**Files:** Modify `pyproject.toml`, `uv.lock`, `README.md`, `docs/architecture.md`, `docs/testing.md`, `ROADMAP.md`; create `docs/library.md`, `docs/migrations/request-policies.md`, `tests/test_install_smoke.py`; extend pinned CI workflow if needed.

**Interfaces:** Preserve package/import names. Core-only install is sufficient for compile/run; an optional Studio extra supplies the web server, with frontend build/assets strategy explicit. Do not imply built UI assets exist inside a core wheel if they do not.

- [x] Write a subprocess smoke check that builds/installs the local package into a temporary environment outside the repository, imports only public types, compiles a tiny inline workflow with a registered stub, runs it using fake providers, and closes. Unset demo/provider environment variables and use an unrelated working directory.
- [x] Run `uv run pytest tests/test_install_smoke.py -q`; expect RED if resource/import assumptions remain. Fix package boundaries and runtime resource access; optional dependencies cannot leak into core import. Do not publish a package.
- [x] Document a Git install pinned to a release tag/commit and editable checkout installation. Use a real tag/commit only after it exists; example placeholders must be explicitly marked until release. Explain the separate Studio build path.
- [x] Document request entry/reset semantics, policy migration, handler/action outcomes, external idempotency responsibilities, supported public imports and remaining limitations. Link both complete examples and the roadmap.
- [x] Run `uv run ruff check src tests app.py`, `uv run pytest -q`, `uv run libretto evaluate`, `npm --prefix web test`, `npm --prefix web run build`, and `npm --prefix web run test:e2e`; expect all PASS. Record current actual counts instead of copying historical numbers.
- [x] Audit the changed core/provider files for business field branches; any remaining ones must belong to explicit demo composition, fixtures or domain guidance, not generic execution authority.
- [x] Complete the execution workflow's final whole-branch review and verified fix pass. Check current CI/review requirements at the final head. Update milestone evidence and mark M1 verified only when its gate is met.
- [x] Commit: `docs: document and verify the reusable core milestone`.

## Self-review and coverage

Tool contracts: Task 2 definitions + Task 6 compilation. Request isolation: Task 3. Confirmation/delivery: Task 4. Action ambiguity/cancellation: Task 5. Two domains/generic evaluator: Task 6. API and transport ownership: Task 7. Distribution and compatibility: Task 8. Each Review Focus input has a named owner test. No task introduces LiveKit, a hosted service, accounts, billing or collaboration.

Remaining owner decision: repository license, recorded on the roadmap. Do not silently choose legal reuse terms; license selection need not block deterministic core refactoring but must be settled before a reusable release is presented as licensed OSS.
