# Libretto Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an English YAML-driven receptionist with text/live voice, visible state, real document retrieval, session-only mock actions, and a Vercel-compatible deployment.

**Architecture:** One WebSocket owns one in-memory session. Speaking generation, semantic evaluation, and eager local retrieval are separately scheduled; ordinary speech does not await an evaluator. Typed graph policy controls stage boundaries and action execution; Flux STT/TTS provide live speech.

**Tech Stack:** Python >=3.12, FastAPI, Pydantic, PyYAML, HTTPX, websockets; TypeScript, React, Vite, browser AudioWorklets; pytest and browser verification. Pin resolved dependencies in uv.lock and package-lock.json.

**Spec:** [Approved latency-first direction](../specs/2026-10-26-latency-first-proposal.md), with the [foundational design](../specs/2026-10-25-yaml-voice-engine-design.md) applying wherever it does not conflict.

## Execution status

Tasks 1–6 implemented and committed. The user subsequently replaced the showcase UI with an ElevenLabs-style agent configuration/YAML/testing workspace; functional YAML editing supersedes the original no-editor constraint. Task 7 hosting/setup checks completed; real-provider calls, microphone/mobile verification and acoustic latency remain pending credentials and device testing. See `docs/evidence.md`.

## Global Constraints

- English only. Cap each demo conversation at **180 seconds**, including when credentials change.
- No application database or database service. Disconnect/expiry ends the session; reconnection visibly starts fresh.
- Runtime owns active/pending stage, typed facts, permissions, transition commits, work epochs, and action prerequisites.
- Shared prompt + active-stage instructions + history/state + authorized retrieved passages on every speaking request.
- No mandatory serial evaluator or FAQ classifier before ordinary speech. Preemptive LLM generation is part of this version; speculative TTS is deferred.
- Visitor credentials live only in browser-tab memory and their backend session. Never export/log/persist keys or expose server keys.
- Mock transfers and message receipts only; no outbound contacts or real telephony. Confirmation binds to the current details/readback snapshot.
- TTFS target is 1.0-1.2 seconds, flag ordinary turns over 1.5 seconds; report actual measurements and cold/tool paths separately.
- Regular coherent commits with normal hooks; public content remains independent and synthetic.
- No live API validation until credentials are configured. Fakes exist in tests, not as a silent live-provider fallback.

## Review Focus

- A caller interrupts during evaluation or immediately before dispatch: stale work must neither speak nor execute an action (Task 2).
- A late evaluator finishes after a correction/new turn: it must not replace newer facts or select a stale stage (Task 2).
- A message is edited after readback: previous confirmation cannot authorize saving the changed details (Tasks 2-3).
- Two callers supply different credentials: authentication must never cross sessions or leak through trace/export (Tasks 4-6).
- Audio/text arrives after cancellation, expiry, or socket reset: the browser must discard it and show the actual session state (Tasks 5-6).

## File Structure

- `src/libretto/schema.py`: strict YAML schema, safe loading, graph/reference validation.
- `src/libretto/state.py`, `events.py`: typed snapshots, facts, evaluations, work epochs, wire events.
- `src/libretto/runtime.py`: scheduling, pending transitions, generation boundaries, interruption, action guards.
- `src/libretto/retrieval.py`, `prompts.py`, `tools.py`: local passage search, shared/stage composition, registered mock actions.
- `src/libretto/providers/base.py`, `openrouter.py`, `deepgram.py`: injected provider protocols and real adapters.
- `src/libretto/server.py`, `cli.py`, root `app.py`: WebSocket service, CLI, deployment entrypoint.
- `examples/receptionist.yaml`, `examples/minimal.yaml`, `examples/knowledge/*.md`, `examples/directory.json`: synthetic workflows and content.
- `web/src/`: React app, typed wire client, PCM capture/playback AudioWorklets, inspector/graph, CSS.
- `tests/`: schema, concurrency/runtime, retrieval/tools, provider contracts, and WebSocket scenarios. Shared fakes stay under tests.
- `pyproject.toml`, `uv.lock`, `web/package.json`, lockfile, deployment config, README: reproducible setup, commands, deployment notes.

---

### Task 1: Validated executable workflow definitions

**Files:** schema/state/events modules; `tests/test_schema.py`; example YAML files; Python package/config and lockfile.

**Interfaces:** `load_workflow(path: Path) -> Workflow`; `Workflow` contains shared prompt, typed fields, knowledge/tool bindings, ordered nodes/edges, start ID and schema version. Node kinds are conversation/action/say/end. `SessionState`, `StageSnapshot`, `Evaluation`, `FactPatch`, `ToolResult`, `ClientEvent`, `ServerEvent` are typed records; wire events use a discriminated `type` field.

- [ ] Write schema tests that reject duplicate YAML keys, unknown node/tool/source references, arbitrary expression operators, and unsupported versions; verify the receptionist and a tiny unrelated graph both load.
- [ ] Run `uv run pytest tests/test_schema.py -q`; confirm the missing loader/schema behavior fails before implementing it.
- [ ] Implement safe bounded YAML loading and typed graph validation. Use an explicit predicate vocabulary, ordered conditions, and next-response transition timing; action prerequisites are explicit bindings.
- [ ] Run focused tests and the current full suite; inspect normalized graph output. Resolve/pin dependencies in the lockfile.
- [ ] Commit `feat: validate staged YAML workflows`.

### Task 2: Concurrent session runtime and authoritative state

**Files:** runtime/state/events modules; `tests/test_runtime.py`; `tests/fakes.py`.

**Interfaces:** `Session(workflow: Workflow, responder: Responder, evaluator: Evaluator, retriever: Retriever, tools: ToolRegistry, clock: Callable[[], float])`; `async submit_turn(text: str, turn_id: str, speculative: bool = False) -> None`; `async confirm_turn(text: str, turn_id: str) -> None`; `async interrupt() -> None`; `async close() -> None`; `events() -> AsyncIterator[ServerEvent]`. Protocols provide `stream_reply(context: GenerationContext) -> AsyncIterator[str]`, `async evaluate(context: EvaluationContext) -> Evaluation`, and `search(query: str, sources: list[str], limit: int) -> list[Passage]`.

- [ ] Write event-controlled async tests: a blocked evaluator cannot delay first response text; a pending stage takes effect at the next generation boundary; a late result cannot overwrite a newer epoch; interruption blocks an undispatched action; unconfirmed speculation cannot reach speech; mocked clock expiry occurs at 180 seconds.
- [ ] Run `uv run pytest tests/test_runtime.py -q`; observe missing behavior failures.
- [ ] Implement per-session task ownership and immutable generation snapshots. Launch evaluation alongside speaking, apply valid pending transitions at boundaries, serialize only short state/action commits, and cancel stale work without holding locks across model waits. Gate actions on authoritative prerequisites; deduplicate within the live session.
- [ ] Run focused concurrency tests and the full suite. Use explicit events instead of timing-sensitive sleeps to prove the nonblocking property.
- [ ] Commit `feat: run speaking and stage evaluation concurrently`.

### Task 3: Complete text receptionist with retrieval and mock outcomes

**Files:** retrieval/prompts/tools modules; example documents/directory/workflow; `tests/test_receptionist.py`, `test_retrieval.py`.

**Interfaces:** `RetrievalIndex.from_directory(path: Path) -> RetrievalIndex`; `search(...)` from Task 2; `compose_prompt(workflow: Workflow, snapshot: StageSnapshot, passages: list[Passage]) -> GenerationContext`; `ToolRegistry` resolves typed registered actions and returns `ToolResult`. `Passage` carries document/chunk IDs, heading, hash, text, and score.

- [ ] Write tests for contextual weekend-hours retrieval, source filtering, missing evidence, shared+stage prompt composition, failed transfer -> offered message -> corrected readback -> confirmed capture, FAQ side question -> resume task, duplicate capture, and cancel versus end-call.
- [ ] Run `uv run pytest tests/test_retrieval.py tests/test_receptionist.py -q`; confirm missing behavior fails.
- [ ] Implement section-aware Markdown chunks and in-memory BM25 search on each nonempty user turn without a classifier/query-rewriter call. Implement synthetic directory/transfer/capture actions and explicit normal/ambiguity/failure paths. Record only session receipts, never imply durable delivery.
- [ ] Run the full suite and scripted scenarios asserting state/action results rather than wording alone.
- [ ] Commit `feat: add receptionist retrieval and session actions`.

### Task 4: OpenRouter streaming, structured evaluation, and credentials

**Files:** `src/libretto/providers/base.py`, `src/libretto/providers/openrouter.py`; `tests/test_openrouter.py`, `tests/test_credentials.py`; `.env.example`.

**Interfaces:** `SessionCredentials` stores optional per-provider visitor overrides separately from environment defaults and has a redacted representation. `OpenRouterAdapter` implements the responder/evaluator protocols. `ProviderError` exposes a safe code and retryability without embedding request headers/keys.

- [ ] Write contract tests for fragmented SSE, structured evaluation validation, provider credit/auth/rate-limit distinctions, two-session credential isolation, and credential-free event/trace/export serialization.
- [ ] Run focused tests and observe failures before implementing the adapter.
- [ ] Verify current public request contracts, implement pooled async HTTP streaming and independently configurable speaker/evaluator model settings. Avoid mutable shared default credentials and silent provider substitution. Default speaking candidate is Gemini 3.5 Flash with minimal supported reasoning; evaluator remains independently selectable.
- [ ] Run provider contract tests and full suite. Once a key exists, run one small live text/evaluation smoke check and report it separately from fake-transport results.
- [ ] Commit `feat: integrate OpenRouter and session credential overrides`.

### Task 5: Live speech and one-connection service

**Files:** Deepgram adapter, server/CLI/root entrypoint; `tests/test_speech.py`, `test_server.py`.

**Interfaces:** the speech adapter maps Flux STT StartOfTurn/EagerEndOfTurn/TurnResumed/EndOfTurn events into Task 2 methods; accepted reply deltas go to Flux TTS Speak, response completion to Flush, interruption to Interrupt. The WebSocket carries typed control events and framed PCM bytes containing epoch/speech metadata. `create_app() -> FastAPI` exposes health, public normalized workflow, and `/api/ws`.

- [ ] Write contract/scenario tests for eager/confirmed/resumed input, acknowledged stage-specific threshold/keyterm changes, whitespace-preserving raw text streaming, cancellation/late audio, 180-second expiry, fresh reconnect, and socket/provider cleanup.
- [ ] Run `uv run pytest tests/test_speech.py tests/test_server.py -q`; verify missing behavior failures.
- [ ] Verify current Flux STT/TTS wire contracts before coding adapters. Use live English STT and Flux TTS, persistent per-session sockets, bounded queues, and no extra fixed silence timer. Keep TTS out of unaccepted speculative generations. Require OpenRouter for text and both providers for voice; missing keys yield actionable status.
- [ ] Run the full suite and a local WebSocket scenario using fake transports. With credentials, run separate live STT/TTS smoke checks; record model, voice, timings, and any unavailable capability.
- [ ] Commit `feat: add interruptible Flux voice sessions`.

### Task 6: Browser demo, graph, inspector, and voice playback

**Files:** `web/src/App.tsx`, `web/src/client.ts`, `web/src/audio.ts`, `web/src/capture.worklet.ts`, `web/src/playback.worklet.ts`, `web/src/styles.css`; `web/package.json`, `web/package-lock.json`, Vite/TypeScript configuration; `web/src/client.test.ts`, `web/src/audio.test.ts`.

**Interfaces:** typed client for Task 5 events/framed audio; masked session-only credentials; `connect`, `sendText`, `startMicrophone`, `interrupt`, `close`, and explicit local trace download. Audio uses verified raw PCM/resampling, bounded buffers, playback progress, and epoch-based stale-frame rejection.

- [ ] Add focused browser protocol tests for stale audio rejection, expiry/reset, and credential-free export; run them before implementing their handlers.
- [ ] Build a restrained paper/ink interface with one accent, a stage rail/graph generated from normalized YAML, conversation area, and inspectable facts/sources/timing. Provide text and microphone controls, countdown, transfer-outcome selector, key fallback, and explicit simulated/session-only labels. Avoid an editor, auth system, or database UI.
- [ ] Verify responsive layout, keyboard/microphone interaction, reduced motion, playback ordering, backpressure, and interrupted versus actually played text. Run `npm --prefix web run build`, browser protocol tests, backend suite, then inspect the real browser.
- [ ] Commit `feat: add the Libretto voice workflow demo`.

### Task 7: Verify latency, prepare hosting, and capture article evidence

**Files:** deployment config, CLI/scenario runner, README, ignored local evidence and an evidence-summary template.

**Interfaces:** `libretto validate <yaml>`, `libretto graph <yaml>`, `libretto serve`, and scripted scenario runner using the same runtime. Deployment packages the Python entrypoint and built React assets; confirm Vercel's current supported FastAPI/static-build layout rather than assuming cross-request memory affinity.

- [ ] Run full backend/frontend checks and acceptance scenarios. Check tracked content/history for excluded private references and staged content for credentials/session data before committing.
- [ ] Measure acoustic-end -> meaningful browser playback, recording endpointing, retrieval, speaking/evaluator request, TTS, cancellation, and actual playback events. Include sample counts, model/provider/config versions, cold/warm conditions, and turns over 1.5 seconds; do not claim the target from synthetic tests or filler.
- [ ] Prepare a verified Vercel preview under Hobby limits; use the user's existing subdomain authorization only after preview verification and available account/DNS access. Use no paid hosting/database integration. Public-provider smoke checks and deployment remain explicitly incomplete if credentials/access are unavailable.
- [ ] Update README with exact setup/run commands, session-reset behavior, BYOK handling, supported capabilities, and measured limitations. Save factual notes for the future article without drafting unapproved claims.
- [ ] Commit `chore: verify the prototype and document deployment` and report the actual completed scope, validation, latency, and remaining external dependencies.

## Execution recommendation

Use native execution in this session, then an independent whole-change review. The tasks share runtime/event interfaces and the first prototype is tightly scoped; one implementer avoids handoff overhead. The user has approved the design direction; plan review and execution-method selection remain the next workflow checkpoint.
