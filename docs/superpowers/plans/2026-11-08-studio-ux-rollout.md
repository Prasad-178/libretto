# Studio UX Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Work directly on main; do not delegate unless separately authorized.

**Goal:** Implement the approved Studio designs as a usable visual interface to the existing YAML runtime, with complete supported-setting coverage and preserved workflow behavior.

**Architecture:** Keep YAML and the existing document transaction/history model authoritative. Studio forms, graph and raw editor share those transactions; Python tool manifests and provider catalogs supply external contracts rather than another executable configuration. Separate catalog discovery and speech transformations from the core runtime, and implement independently testable slices.

**Tech Stack:** Existing React/TypeScript, Radix Select, React Flow, CodeMirror and YAML CST editing; Python/Pydantic backend and optional pinned LiveKit integration. Reuse existing components before adding dependencies.

**Spec:** [Visual contract](../../reviews/2026-11-05-studio-visual-contract.md), [field inventory](../../reviews/studio-visual-bindings.json), [reference study](../../reviews/2026-11-04-studio-ux-reference-study.md), [Paper designs](https://app.paper.design/file/01M6A0TRXN4CJ9WFK05YH6CX0W/p-5-0). Product boundaries remain in [product direction](../../product-direction.md).

**Status:** Approved for implementation by Prasad on 2026-11-11. Execute inline on main with focused commits. Baseline inspected: main at `f92752a`; unrelated untracked documents remain untouched.

## Global Constraints

- Work directly on `main`; make regular focused commits after applicable checks. No push, deployment or paid inference is part of this planning pass.
- Studio remains an OSS visual editor/testing/debugging companion. No accounts, billing, collaboration or managed runtime.
- YAML owns executable semantics; `.studio.json` owns presentation only. Credentials never enter either, persisted drafts, exports or traces.
- Keep core imports independent of Studio and LiveKit. Preserve both **LiveKit** and **Direct Deepgram** configurations.
- Preserve comments, untouched prompt text, invalid drafts, explicit export semantics, history boundaries and immutable test snapshots.
- Every supported executable YAML field needs a structured editing path, including Advanced and retained inactive values. Raw YAML alone is not completion.
- Selection must not move the canvas. Shared destinations stay visibly connected. Routes remains a secondary index, not a primary tab.
- Model prices/default metadata come from OpenRouter with units and freshness; no invented prices/defaults. Use actual provider logos and centered SVG chevrons.
- TTS scroll belongs to its right pane, including at scroll boundaries. Reasoning stays compact. Voice chooser stays anchored to its trigger.
- Colours follow the visual contract. Arbitrary result names never imply business success.
- Fetch Paper structure/styles during implementation rather than recreating screens from screenshots. Generic labels derive from the loaded workflow; Northline/booking content is fixture data.

## Review Focus

1. Invalid/empty YAML and unrelated compiler failures must not remove recovery tools or misrepresent knowledge as empty: tasks 1, 2 and 6.
2. Shared policy references, field-type changes and kind conversions must not silently change other actions or discard retained settings: tasks 2 and 5.
3. Missing/stale provider metadata or changed credentials must preserve selected model/voice IDs without cross-session disclosure: tasks 3 and 4.
4. Pronunciation streaming and partial synthesis must never turn interrupted readbacks into delivered approval authority: task 4.
5. Nested scroll, zoom, keyboard use and popovers near viewport edges must keep controls reachable and the canvas stationary: tasks 1, 4, 5 and 7.

## Coverage and tracking

The 63 entries across 10 schema models are an inventory, not proof of implementation. Create a companion implementation ledger with one row per binding and separate rows for new reasoning semantics and pronunciation rules. Each row records: Paper screen/control, YAML path, implementation task, form-to-YAML test, YAML-to-form test, rendered evidence and final commit. Distinguish **planned**, **implemented** and **verified**.

Track collection operations as well as fields: add/rename/remove for nodes, fields, routes, knowledge, requests and confirmations; route ordering; recursive predicates; optional/unset versus explicit values. Include all four node kinds and retained inactive properties. Shared policies need multi-action fixtures, not just the booking example.

Read the 23 artboards as groups:

| Task | Paper coverage | Deliverable |
| --- | --- | --- |
| 1 | 01, 10, 12, 16 | Shell, instructions, issues and recovery |
| 2 | 07, 13, 21–23 | Complete source-backed controls and understandable workflow/step/rule settings |
| 3 | 02, 11, 18 | Models, reasoning and stage controller |
| 4 | 04, 15, 20 | STT, TTS, connection, voices and pronunciations |
| 5 | 05, 06, 09, 14, 19 | Graph, connections, tools, arguments and outcomes |
| 6 | 03 | Knowledge and retrieval |
| 7 | 08, 17 plus all | Test/debug, export and integrated acceptance |

## Delivery sequence

Implement in order with a reviewable local checkpoint after each task. A checkpoint is a working slice, not a complete product claim. Do not run another open-ended competitor/design pass. If an API cannot support an approved control, record the concrete limitation and preserve existing values rather than fake support.

### Task 1: Establish the shell and recovery foundation

**Files:** Modify `web/src/App.tsx`, `web/src/studio/StudioShell.tsx`, `web/src/studio/DocumentStatus.tsx`, `web/src/studio/YamlWorkspace.tsx`, existing shared CSS/control files and `src/libretto/studio_entry.py`. Test in `web/e2e/studio-shell.spec.ts`, `studio-controls.spec.ts`, `studio-recovery.spec.ts` and `tests/test_server.py`.

**Interfaces:** Consume the existing document store and shell navigation. Keep document changes in existing dispatch/transaction APIs; introduce no second form document or workspace persistence layer.

- [x] Create the coverage ledger from the inventory; identify which controls already work before replacing them. Read the accepted Paper component structure/styles.
- [x] Add focused regressions for shell-visible import errors, editable empty drafts and invalid drafts, instruction-editor sizing, dropdown alignment and favicon markup in served Studio HTML.
- [x] Run those regressions and reproduce the applicable failures before modifying behavior.
- [x] Implement the accepted shell/navigation and shared control styling; keep expanded instructions, issue navigation, rename, validation and undo discoverable. Use the exact description helper: “For your reference; doesn’t affect agent behaviour.”
- [x] Verify desktop layouts at 1440, 1280 and 1024 widths, keyboard focus and a smaller/zoomed viewport. Preserve an accessible fallback where a full graph cannot fit.
- [x] Run focused checks, inspect actual screenshots, record coverage evidence and commit the slice.

### Task 2: Complete source-backed editing and settings

**Files:** Modify `web/src/studio/SettingsPage.tsx`, `yaml-edits.ts`, `editor-commands.ts`, `field-references.ts`, `PredicateEditor.tsx`, `web/src/StepInspector.tsx` and their tests. Extract focused workflow, step and confirmation editors beside these files as they replace sections of the large Settings component. Backend changes belong in existing compiler/schema validation only when necessary for a supported edit.

**Interfaces:** All edits produce one existing document transaction. Friendly readback tokens serialize to stable `{field_id}` placeholders. Request/policy editors operate on existing `requests`, `confirmations` and node bindings, not a new policy representation.

- [x] Add regressions for form → exported YAML → Python parse and YAML → form for every inventory field owned by this task. Include `Yes`/`No`/`on`, comments, folded prompts, optional deletion, allowed choices, nested predicates and invalid/null form-facing shapes.
- [x] Add reference tests for identifier rename/removal, incompatible field types, shared policies used by two actions, request-field ownership and node-kind conversion. Assert either one valid atomic update or a blocked edit with affected-usage guidance.
- [x] Run focused tests to establish failures, then implement plain-language settings with Advanced typed controls. Keep readback entry constrained to Speak first with explanation; ordinary conversation steps retain both modes.
- [x] Preserve inactive properties explicitly. Make request/policy add/rename/remove, ordered rules and retained values visually reachable. Keep description out of generated prompts.
- [x] Verify blur/unmount ends history groups; multiline inputs retain Enter while typing; cancel/save semantics match the chosen UI. Verify undo/redo returns the complete multi-reference transaction.
- [x] Run focused frontend/backend checks and browser settings checks; record ledger evidence and commit.

### Task 3: OpenRouter catalog, reasoning and stage controller

**Files:** Modify `src/libretto/studio_api.py`, `schema.py`, `prompts.py`, `providers/openrouter.py`, `web/src/studio/runtime-api.ts` and the relevant Settings sections. Create focused catalog/cache and model-picker modules, rather than embedding HTTP/cache/UI logic together. Tests: `tests/test_openrouter.py`, `test_schema.py`, `test_server.py`, frontend catalog/reasoning unit tests and `web/e2e/studio-settings.spec.ts`.

**Interfaces:** Stable OpenRouter model IDs remain serialized; names, pricing, effort capabilities and freshness are display metadata. Both model selectors consume the same normalized catalog. Stage-controller guidance edits `evaluation_prompt`; immutable evidence/output rules remain runtime-owned.

- [x] Recheck the official catalog contract at execution time. Define normalized metadata and bounded cache/timeouts, with current/custom model IDs retained through catalog failures.
- [x] Pin regressions for per-token → USD per-million conversion, zero versus missing prices, stale/offline catalogs, unsupported efforts and models without effort metadata.
- [x] Implement the searchable catalog and bundled maintained provider logos. Do not filter the list down to the two currently configured models or silently change a selected model.
- [x] Add explicit `reasoning: default` as the no-override choice while preserving the current omitted-setting behavior (`minimal`) for existing YAML. Extend the effort enum to supported OpenRouter effort values. Add compatibility tests showing Default omits `reasoning.effort` and explicit efforts reach the request; preserve unrelated request reasoning options.
- [x] Implement the compact stepped slider from reported supported efforts; reset saves Default rather than the currently reported effective effort. Missing defaults show Model default without an invented thumb/value.
- [x] Expose controller model and workflow guidance. Share prompt assembly with any instruction preview so the preview cannot drift from actual evaluation. Do not introduce a new controller-effort setting or let users replace built-in authority rules.
- [x] Run focused tests, inspect picker/slider/expanded-controller states, update migration docs and ledger, then commit. Split backend contract and UI into separate focused commits if needed.

### Task 4: Speech, compatible voices and pronunciation

**Files:** Modify `src/libretto/schema.py`, `speech.py`, `integrations/livekit/models.py`, the relevant audio/coordinator boundary, `studio_api.py`, `web/src/voice-config.ts` and extracted Speech settings. Create a focused streaming pronunciation transformer and provider-aware voice-catalog boundary. Test in `tests/test_speech.py`, `test_speech_portability.py`, `test_livekit_adapter.py`, `test_livekit_review.py`, `test_credentials.py`, frontend voice tests and `web/e2e/studio-livekit.spec.ts` plus new speech-layout checks.

**Interfaces:** Proposed new YAML shape: `speech.pronunciations: [{word: "Libretto", say_as: "lih-BRET-oh"}]`, default empty. Rows are literal, case-sensitive, boundary-aware replacements; longer overlapping terms win. No regex, phoneme dialect or recursive replacement. Apply only to synthesis text, retaining original transcript/facts/arguments and delivery identity. This is a new typed executable field, not sidecar metadata.

- [x] Verify pinned SDK hooks and both engines' synthesis entry points before choosing the transform integration. Reconfirm official voice-list compatibility; do not assume a universal LiveKit catalog endpoint.
- [x] Write schema/streaming regressions for empty rules, duplicate/conflicting terms, phrase boundaries, split chunks, punctuation, Unicode, overlapping terms and replacement text containing another source term. Reject ambiguous duplicate rules with actionable paths.
- [x] Add adapter regressions proving pronunciation changes speech input only, and failed/truncated synthesis still cannot grant full-readback delivery. Preserve browser message/epoch acknowledgement authority.
- [x] Implement separate STT and TTS panes, provider/model settings, credential-source selection and capability guidance. LiveKit-inactive recognition hints/patient tuning remain explicitly inactive until genuinely wired; Direct Deepgram keeps supported settings.
- [x] Implement provider-aware discovery with pagination, session-private authenticated caches and current/custom ID preservation. Inference shows honestly labelled compatible suggestions if live discovery is unavailable; it does not require a new provider key to browse suggestions. No automatic paid voice preview.
- [x] Implement the anchored searchable voice popover and pronunciation rows. Test flip/clipping, selection, Escape, returned focus and trigger anchoring while TTS scrolls.
- [x] Fill enough rows to overflow. Assert TTS scrolls through both ends while root and STT scroll offsets remain unchanged; repeat keyboard, zoom and smaller viewport checks.
- [x] Run deterministic speech/credential/layout checks, update schema/docs/inventory and ledger, then commit in focused contract/adapter/UI chunks.

### Task 5: Graph authoring, tools and outcome clarity

**Files:** Modify `web/src/WorkflowGraph.tsx`, `StepInspector.tsx`, `studio/RouteInspector.tsx`, `ActionInspector.tsx`, `StepComposer.tsx`, `graph-model.ts`, `graph-layout.ts`, `tool-manifest.ts` and existing graph/command tests. Add focused browser authoring cases beside `web/e2e/studio-controls.spec.ts`.

**Interfaces:** Graph edges read/write the existing ordered `nodes[id].edges` array. Declared tool results/parameters come from `ToolRegistry.manifest()`; only YAML bindings/destinations/labels are edited here. Keep layout/viewport metadata separate from execution.

- [x] Test connected shared targets, cycles, multiple terminal nodes, long/custom IDs and multiple action results using generic fixtures. Assert ordinary selection preserves viewport; explicit Find/Fit may navigate.
- [x] Implement graph/inspector/connection layouts and clear add/edit/remove paths. Retain the secondary Routes index for scanning and access without reintroducing a primary tab.
- [x] Expose action arguments, required facts and each declared result destination. Keep Python result contracts read-only, explain where to change them, and preserve mandatory `failed`/`unknown` recovery validation.
- [x] Verify result binding, destination, label, route ID, timing and order remain separate source-backed edits. Typed predicates and language conditions must display their actual semantics.
- [x] Use the deterministic colour contract, including neutral custom result names and text/icon explanation for unknown outcomes. Test metadata restoration and final connector geometry without treating cosmetic hints as executable state.
- [x] Run graph/command and browser checks, inspect screenshots of Northline and the independent repair fixture, record evidence and commit.

### Task 6: Knowledge that survives unrelated issues

**Files:** Modify `src/libretto/studio_api.py`, `web/src/studio/SourcesPage.tsx`, `SourceDetails.tsx`, `SourceUsageDialog.tsx`, `source-usage.ts` and relevant retrieval APIs. Test in `tests/test_studio_sources.py`, `test_access_limits.py` and `web/e2e/studio-sources.spec.ts`.

**Interfaces:** Use the existing real retriever and project-root restrictions. Distinguish current safe knowledge configuration from a clearly labelled last-valid view; never run a current invalid workflow or retrieve arbitrary draft paths under cover of fallback.

- [x] Reproduce an unrelated missing action outcome alongside valid knowledge. Assert knowledge is not silently replaced by “0 collections”; issue links identify the offending action and preserve mandatory recovery validation.
- [x] Implement distinct loading/empty/error/stale states with consistent collection display names, usage links and passage evidence. Keep local-folder instructions appropriate to local versus public-demo capabilities.
- [x] Test delayed responses after collection/config changes, invalid draft paths, symlinks and outside-root paths. Old responses cannot replace newer results or weaken boundaries.
- [x] Run focused source/backend/browser checks, inspect populated and error states, update ledger and commit.

### Task 7: Debugging, export and whole-workflow acceptance

**Files:** Modify `web/src/studio/TestPanel.tsx`, `ExportDialog.tsx`, `ChangeList.tsx`, `web/src/App.tsx` and relevant event-display modules only as necessary. Extend existing browser suites and document the final evidence in `docs/reviews/`.

**Interfaces:** Test UI observes the captured runtime snapshot and existing structured events; receipts are read-only. Export serializes the same document plus optional presentation sidecar. This task does not add the M3 scenario-runner platform.

- [x] Implement the approved test/debug and export screens, with understandable interrupted-readback/blocked-action explanations linked to the relevant step/rule. If an explanation lacks an authoritative event, add a narrow structured reason rather than infer success from transcript text.
- [x] Test failed startup, cancellation while connecting, stop, interrupted synthesis, invalid editing during a frozen test and snapshot release. No document lock remains after failure.
- [x] Complete two end-to-end authoring flows: edit Northline; build/modify the repair workflow including field, rule, argument and outcome changes. Export, reopen, undo/redo and inspect corresponding raw YAML. Confirm no credentials leak.
- [x] Finish every inventory row with both-direction evidence, including new schema fields. Any unsupported variant remains an explicit gap; do not mark the UI complete while it exists.
- [x] Run `uv run ruff check .`, `uv run pytest`, `npm test --prefix web`, `npm run build --prefix web` and `npm run test:e2e --prefix web`; inspect current workflow requirements for additional applicable checks. Record exact final head and results, not historical totals.
- [x] Review actual rendered evidence at 1440/1280/1024 and smaller/zoomed layouts, keyboard navigation, empty/error/loading states and long content. Separate deterministic evidence from still-pending real-provider voice acceptance.
- [x] Update the roadmap's stale baseline/next-work sections and compatibility notes. Commit final documentation; verify applicable CI at the exact pushed head when a push is authorized. Verify production separately if deployment is requested.

## Discussion decisions before execution

Recommended approach: execute natively in this session in the order above, with a local review checkpoint after each slice. Existing components/runtime stay in place; extract modules only where the touched responsibility needs it. Do not turn this into a simultaneous rewrite.

Two explicit implementation choices to review with this plan:

1. **Default reasoning:** use the explicit `default` YAML value for new no-override behavior; keep omission compatible with today's `minimal`. A future default migration would be a separate deliberate change.
2. **Pronunciations:** ship the simple `word` → `say_as` speech-only rules above first, rather than provider-specific pronunciation dictionaries. Broader phonetic controls are outside this pass.

Provider discovery feasibility is an execution check, not a reason to promise exhaustive voice support. Live-provider M2 acceptance remains outstanding and is not replaced by a polished UI or mocked browser tests.

## Self-review

All 23 screens have an owning task. The 63-field inventory is enforced by the implementation ledger and both-direction tests, including specified-but-not-drawn Advanced variants. New schema behavior has dedicated compatibility/adapter tasks. Shared-policy edits, inactive values, discovery failures, recovery and delivery authority have explicit owning checks. No application code, dependency, server process or deployment was changed to prepare this plan.


Implementation closeout: local code head `686b19a`, one independent whole-rollout review and one TDD fix pass. See [final review and decisions](../../reviews/2026-11-12-studio-ux-final-review.md) and [binding/evidence ledger](../../reviews/2026-11-11-studio-implementation-coverage.md). No remote CI/deployment or paid live-provider acceptance is implied.
