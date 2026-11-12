# Studio UX implementation coverage

Status: implementation started 2026-11-11. A listed design control is not verified behavior.

| Binding | Design control | Task | Status / evidence |
| --- | --- | --- | --- |
| `FieldSpec.type` | 07 Collected data > Type; reference-aware type change | 2 | Planned |
| `FieldSpec.description` | 07 Collected data > What should the agent collect? | 2 | Planned |
| `FieldSpec.choices` | 07 Collected data > Advanced > Allowed choices token input; specified control | 2 | Planned |
| `Predicate.op` | 13 State check > Check type / All / Any / Not | 2 | Planned |
| `Predicate.field` | 13 State check > Collected field selector | 2 | Planned |
| `Predicate.value` | 13 State check > Expected value; typed text/boolean control; specified variant | 2 | Planned |
| `Predicate.conditions` | 13 State check > Nested checks; Add/Remove; recursive specified variant | 2 | Planned |
| `Edge.label` | 09/19 Connection > Canvas label | 5 | Planned |
| `Edge.id` | 09/19 Connection > Advanced > Route ID; reference-safe rename; specified control | 5 | Planned |
| `Edge.to` | 09/19 Connection > Go to | 5 | Planned |
| `Edge.condition` | 09 Connection > Language condition | 5 | Planned |
| `Edge.predicate` | 13 Connection > State check | 5 | Planned |
| `Edge.result` | 19 Outcome route > When the tool returns; registered result selector | 5 | Planned |
| `Edge.timing` | 09/19 Connection > Advanced > Transition timing; enum select; specified control | 5 | Planned |
| `RequestSpec.fields` | 21 Advanced > Task memory / 23 Task settings > Fields kept for this task; typed multiselect | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `ConfirmationSpec.request` | 23 Confirmation > Advanced > Task/request binding | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `ConfirmationSpec.fields` | 23 Confirmation > Which details must the caller confirm? | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `ConfirmationSpec.acceptance_field` | 23 Confirmation > Advanced > Approval boolean field | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `ConfirmationSpec.consent_field` | 23 Confirmation > Advanced > Optional consent boolean field | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `ConfirmationSpec.require_delivery` | 23 Confirmation > Wait until the full message has played | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.begin_request` | 22 More options > Start a new task here; request selector; specified advanced control | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.confirmation` | 22 Linked confirmation rule / 23 Rule editor; stable policy binding in Advanced | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.kind` | 22 More options > Step kind; validated conversion; specified advanced control | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.title` | 22 Step name; graph card heading | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.prompt` | 05 Step inspector > Prompt; expanded editor | 2 | Planned |
| `Node.text` | 22 Step settings > Exact message for Say kind; specified kind variant | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.readback` | 22 Read these details back; friendly tokens map to stable field placeholders | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.tools` | 22 More options > Available tools in this step; typed multiselect | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.knowledge` | 22 More options > Step knowledge; typed multiselect | 6 | Planned |
| `Node.tool` | 14 Action > Registered Python tool | 5 | Planned |
| `Node.requires` | 14 Action > Before this action can run > Required fields multiselect; specified editable variant | 5 | Planned |
| `Node.arguments` | 14 Action > Inputs; typed field mappings | 5 | Planned |
| `Node.edges` | 05/09/13/19 Connections; Add/Edit/Remove; ordered routing rules | 2 | Planned |
| `Node.patient` | 22 More options > Patient turn handling; capability explanation when ineffective | 2 | Planned |
| `Node.entry` | 22 When this step starts > Wait for caller / Speak first; readback steps require Speak first | 2 | Planned |
| `Models.speaker` | 11 Conversation > Response model | 3 | Planned |
| `Models.evaluator` | 18 Stage controller > Controller model | 3 | Planned |
| `Models.reasoning` | 11 Conversation > Reasoning slider; default/max/etc require schema extension | 3 | Planned |
| `SpeechEndpoint.voice` | 04/20 TTS > Voice picker or custom voice ID; unused STT voice preserved in Advanced endpoint fields | 4 | Planned |
| `SpeechEndpoint.provider` | 04 STT/TTS model picker > Provider; affects credential/capability options | 4 | Planned |
| `SpeechEndpoint.model` | 04 STT/TTS model picker > Model; unknown IDs editable through custom ID fallback | 4 | Planned |
| `Speech.engine` | 04 Speech > Voice integration: LiveKit / Direct Deepgram | 4 | Planned |
| `Speech.credential_mode` | 15 Connection > Credential source: Inference / Provider keys; specified selector variant | 4 | Planned |
| `Speech.stt` | 04 Speech > Speech recognition section | 4 | Planned |
| `Speech.tts` | 04 Speech > Voice output section | 4 | Planned |
| `Speech.hints` | 04 Speech > Recognition vocabulary | 4 | Planned |
| `Workflow.version` | 21 Advanced > Schema version; supported versions only | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.id` | 21 Advanced > Workflow ID; reference-safe changes | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.name` | 01 Agent name / header rename / 21 Workflow settings > Name | 2 | Implemented: Conversation editor; source-backed edits, Undo and rendered evidence in studio-agent.spec.ts |
| `Workflow.description` | 21 What does it help with? | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.start` | 21 Conversation starts at; synthetic Start connector | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.shared_prompt` | 01/12 Conversation > Instructions | 2 | Implemented: Conversation editor; source-backed edits, Undo and rendered evidence in studio-agent.spec.ts |
| `Workflow.welcome` | 01 Conversation > First message | 2 | Implemented: Conversation editor; source-backed edits, Undo and rendered evidence in studio-agent.spec.ts |
| `Workflow.fields` | 07 Collected data; Add/Edit/Remove; reference-aware field ID rename | 2 | Planned |
| `Workflow.tools` | 21 Advanced > Available registered tools; multiselect | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.knowledge` | 03 Knowledge > Collection definitions; local path/ID editor uses existing collection form pattern | 6 | Planned |
| `Workflow.common_knowledge` | 21 Advanced > Shared knowledge; multiselect | 6 | Planned |
| `Workflow.models` | 11 Conversation + 18 Stage controller | 2 | Planned |
| `Workflow.speech` | 04 Speech + 15 Connection configuration; credentials themselves are outside YAML | 2 | Planned |
| `Workflow.nodes` | 05 Workflow > Add/Remove/Convert steps; 22 Step settings; reference-aware node ID rename | 2 | Planned |
| `Workflow.requests` | 21 Advanced > Task memory / 23 Task settings; add/rename/remove with reference validation | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.confirmations` | 21 Before actions run > Edit rule / 23 Confirmation; IDs and shared bindings in Advanced | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.evaluation_prompt` | 18 Stage controller > Controller instructions | 3 | Planned |
| `Models.reasoning: default` and expanded efforts | 11 Compact slider / reset | 3 | Planned: compatibility + request serialization |
| `Speech.pronunciations` | 04 Word → Say as | 4 | Planned: schema + synthesis-only transformation |

## Cross-cutting acceptance

- All collection add/rename/remove operations and reference updates.
- Form → export → backend parse and YAML → form for every binding.
- Shared policies, route ordering, nested typed predicates, inactive retained values.
- Actual rendered/keyboard/scroll evidence, including error/empty/loading states.
- No inference or credentials required by deterministic checks.

## Foundation checkpoint — 2026-11-11

- Editor-shell import errors preserve the open document and offer dismissal; invalid UTF-8 gives actionable guidance. Browser regression failed before the fix and passed afterward.
- Shared instructions use the full form width; screenshot inspected. Dropdown chevrons remain centered in visible Settings controls.
- `/studio` advertises a stable SVG favicon shared with the Vite entrypoint; production build emits the asset.
- Purpose helper explains description is reference-only.
- Empty/malformed draft recovery and 1440/1280/1024 canvas/inspector checks passed. This is not new-layout completion: Paper currently reports its listed Libretto file unavailable.

## Model backend checkpoint — 2026-11-11

- Explicit Default reasoning and expanded effort values are implemented in schema/request serialization, with omission preserving minimal. See [compatibility notes](../migrations/reasoning-defaults.md). Slider and picker UI remain planned.
- `GET /api/studio/models` provides credential-free OpenRouter metadata, USD base input/output prices per million tokens, request charges when supplied, effort capabilities, fetched time and fresh/stale/unavailable state.
- Cache: one hour fresh, one-minute failure backoff, unavailable after one day; bounded five-second upstream requests; no credential or inference request. Returned values are detached from the cache.
- Deterministic checks cover missing/malformed metadata, free versus unknown rates, stale recovery/expiry, concurrent discovery and the HTTP endpoint. A public metadata-only request also normalized 469 text-capable models successfully; that count is an observation, not a fixed catalog.
- No model selection or voice setting has been silently changed. The new catalog is not yet connected to the visual picker.

## Verification and remaining blocker

Latest checks: 256 backend tests, 121 frontend tests, 31 browser tests (one worker), production build and focused Ruff checks passed. The first default-concurrency browser run had one startup-recovery failure; the isolated rerun and six repeats passed. This transient remains recorded rather than being hidden by the later green run.

Paper lists Libretto as open/active but direct structure queries and JSX export return “This file no longer exists. It may have been deleted.” Layout implementation remains pending reconnection. Existing screenshots verify the narrow fixes only, not parity with the new designs. The remaining rollout and final independent review are pending; no remote CI/deployment claim is made.

## Navigation and Conversation checkpoint — 2026-11-12

Paper access was restored and exact JSX was read for screens 01 and 12. The sidebar, workflow identity header, Conversation editor, instructions expansion and responsive layouts are implemented. Tools and Collected data now have separate functional destinations using their existing controls; their full visual refresh remains pending. Stage-controller guidance has a structured editing path; model selection remains the existing editor until the catalog picker slice. Speech retains its current controls under its own Agent section.

Agent edits and the expanded textarea share the document transaction/history model. Browser tests verify name/header/YAML synchronization, grouped Undo, focus restoration, sidebar keyboard navigation, controller guidance serialization, Default reasoning and layouts at 1440/1280/1024. Current frontend checks: 121 unit tests, 37 browser tests, production build and Ruff passed. The rename test was updated to compare rendered inner text consistently after the header became two lines. New layouts have not been deployed.

## Workflow, step and confirmation checkpoint — 2026-11-12

Read exact Paper JSX for screens 21–23. Workflow and Step settings stage edits until Save; Cancel discards them, Save commits one Undo transaction, and stale dialogs refuse to overwrite newer changes. Shared rules open in a focused view showing affected steps. Rule/task bindings, protected readbacks, entry behavior, IDs and advanced settings have structured controls. Reference-safe renames preserve comments and update executable references plus presentation metadata atomically. Referenced definitions cannot be removed or changed to an incompatible type.

Regression evidence covers protected details, escaped placeholders, Unicode limits, pending ID renames, field/task/policy references, source fidelity, stale edits and exported YAML accepted by the backend. Background validation no longer navigates away from the current editor. Rendered screens and fixed dialog controls at 1280/1024 were inspected. Checks: 256 backend, 134 frontend and 44 browser tests, production build, Ruff and diff checks passed. Remaining inventory parity and final independent review are pending. No push, remote CI or deployment is claimed.
