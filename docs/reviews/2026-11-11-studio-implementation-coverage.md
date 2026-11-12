# Studio UX implementation coverage

Status: locally complete and reviewed, updated 2026-11-12. All three Important review findings were fixed in one TDD pass. Two minor follow-ups remain in the final review record. Historical checkpoint totals below describe their own heads.

| Binding | Design control | Task | Status / evidence |
| --- | --- | --- | --- |
| `FieldSpec.type` | 07 Collected data > Type; reference-aware type change | 2 | Implemented: CollectedDataPage; settings-edits.test.ts, studio-data.spec.ts, studio-settings-dialogs.spec.ts (type/reference safety, choices, description, rename, export and Undo) |
| `FieldSpec.description` | 07 Collected data > What should the agent collect? | 2 | Implemented: CollectedDataPage; settings-edits.test.ts, studio-data.spec.ts, studio-settings-dialogs.spec.ts (type/reference safety, choices, description, rename, export and Undo) |
| `FieldSpec.choices` | 07 Collected data > Advanced > Allowed choices token input; specified control | 2 | Implemented: CollectedDataPage; settings-edits.test.ts, studio-data.spec.ts, studio-settings-dialogs.spec.ts (type/reference safety, choices, description, rename, export and Undo) |
| `Predicate.op` | 13 State check > Check type / All / Any / Not | 2 | Implemented: recursive PredicateEditor; editor-commands.test.ts, studio-authoring.spec.ts (typed creation/export); nested All/Any/Not + typed boolean/string export/backend/reopen acceptance in studio-authoring.spec.ts |
| `Predicate.field` | 13 State check > Collected field selector | 2 | Implemented: recursive PredicateEditor; editor-commands.test.ts, studio-authoring.spec.ts (typed creation/export); nested All/Any/Not + typed boolean/string export/backend/reopen acceptance in studio-authoring.spec.ts |
| `Predicate.value` | 13 State check > Expected value; typed text/boolean control; specified variant | 2 | Implemented: recursive PredicateEditor; editor-commands.test.ts, studio-authoring.spec.ts (typed creation/export); nested All/Any/Not + typed boolean/string export/backend/reopen acceptance in studio-authoring.spec.ts |
| `Predicate.conditions` | 13 State check > Nested checks; Add/Remove; recursive specified variant | 2 | Implemented: recursive PredicateEditor; editor-commands.test.ts, studio-authoring.spec.ts (typed creation/export); nested All/Any/Not + typed boolean/string export/backend/reopen acceptance in studio-authoring.spec.ts |
| `Edge.label` | 09/19 Connection > Canvas label | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Edge.id` | 09/19 Connection > Advanced > Route ID; reference-safe rename; specified control | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Edge.to` | 09/19 Connection > Go to | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Edge.condition` | 09 Connection > Language condition | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Edge.predicate` | 13 Connection > State check | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Edge.result` | 19 Outcome route > When the tool returns; registered result selector | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Edge.timing` | 09/19 Connection > Advanced > Transition timing; enum select; specified control | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
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
| `Node.prompt` | 05 Step inspector > Prompt; expanded editor | 2 | Implemented: StepPromptEditor / protected-step advanced prompt; studio-shell.spec.ts, studio-yaml.spec.ts (edit/export/Undo, expanded focus return) |
| `Node.text` | 22 Step settings > Exact message for Say kind; specified kind variant | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.readback` | 22 Read these details back; friendly tokens map to stable field placeholders | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.tools` | 22 More options > Available tools in this step; typed multiselect | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Node.knowledge` | 22 More options > Step knowledge; typed multiselect | 6 | Implemented: Sources/usage/collection settings and Step settings; source-usage.test.ts, test_studio_sources.py, studio-sources.spec.ts (real retrieval, scope, path/ID, export and Undo) |
| `Node.tool` | 14 Action > Registered Python tool | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Node.requires` | 14 Action > Before this action can run > Required fields multiselect; specified editable variant | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Node.arguments` | 14 Action > Inputs; typed field mappings | 5 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Node.edges` | 05/09/13/19 Connections; Add/Edit/Remove; ordered routing rules | 2 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Node.patient` | 22 More options > Patient turn handling; capability explanation when ineffective | 2 | Implemented: StepSettingsDialog; settings-edits.test.ts, studio-settings-dialogs.spec.ts (readback entry restriction and inactive capability guidance) |
| `Node.entry` | 22 When this step starts > Wait for caller / Speak first; readback steps require Speak first | 2 | Implemented: StepSettingsDialog; settings-edits.test.ts, studio-settings-dialogs.spec.ts (readback entry restriction and inactive capability guidance) |
| `Models.speaker` | 11 Conversation > Response model | 3 | Implemented: ModelPicker/ReasoningControl/ControllerInstructions; model-catalog.test.ts, studio-models.spec.ts, studio-agent.spec.ts, test_openrouter.py (catalog/custom IDs/default serialization) |
| `Models.evaluator` | 18 Stage controller > Controller model | 3 | Implemented: ModelPicker/ReasoningControl/ControllerInstructions; model-catalog.test.ts, studio-models.spec.ts, studio-agent.spec.ts, test_openrouter.py (catalog/custom IDs/default serialization) |
| `Models.reasoning` | 11 Conversation > Reasoning slider; default/max/etc require schema extension | 3 | Implemented: ModelPicker/ReasoningControl/ControllerInstructions; model-catalog.test.ts, studio-models.spec.ts, studio-agent.spec.ts, test_openrouter.py (catalog/custom IDs/default serialization) |
| `SpeechEndpoint.voice` | 04/20 TTS > Voice picker or custom voice ID; unused STT voice preserved in Advanced endpoint fields | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `SpeechEndpoint.provider` | 04 STT/TTS model picker > Provider; affects credential/capability options | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `SpeechEndpoint.model` | 04 STT/TTS model picker > Model; unknown IDs editable through custom ID fallback | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Speech.engine` | 04 Speech > Voice integration: LiveKit / Direct Deepgram | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Speech.credential_mode` | 15 Connection > Credential source: Inference / Provider keys; specified selector variant | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Speech.stt` | 04 Speech > Speech recognition section | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Speech.tts` | 04 Speech > Voice output section | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Speech.hints` | 04 Speech > Recognition vocabulary | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Workflow.version` | 21 Advanced > Schema version; supported versions only | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.id` | 21 Advanced > Workflow ID; reference-safe changes | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.name` | 01 Agent name / header rename / 21 Workflow settings > Name | 2 | Implemented: Conversation editor; source-backed edits, Undo and rendered evidence in studio-agent.spec.ts |
| `Workflow.description` | 21 What does it help with? | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.start` | 21 Conversation starts at; synthetic Start connector | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.shared_prompt` | 01/12 Conversation > Instructions | 2 | Implemented: Conversation editor; source-backed edits, Undo and rendered evidence in studio-agent.spec.ts |
| `Workflow.welcome` | 01 Conversation > First message | 2 | Implemented: Conversation editor; source-backed edits, Undo and rendered evidence in studio-agent.spec.ts |
| `Workflow.fields` | 07 Collected data; Add/Edit/Remove; reference-aware field ID rename | 2 | Implemented: CollectedDataPage; settings-edits.test.ts, studio-data.spec.ts, studio-settings-dialogs.spec.ts (type/reference safety, choices, description, rename, export and Undo) |
| `Workflow.tools` | 21 Advanced > Available registered tools; multiselect | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.knowledge` | 03 Knowledge > Collection definitions; local path/ID editor uses existing collection form pattern | 6 | Implemented: Sources/usage/collection settings and Step settings; source-usage.test.ts, test_studio_sources.py, studio-sources.spec.ts (real retrieval, scope, path/ID, export and Undo) |
| `Workflow.common_knowledge` | 21 Advanced > Shared knowledge; multiselect | 6 | Implemented: Sources/usage/collection settings and Step settings; source-usage.test.ts, test_studio_sources.py, studio-sources.spec.ts (real retrieval, scope, path/ID, export and Undo) |
| `Workflow.models` | 11 Conversation + 18 Stage controller | 2 | Implemented: ModelPicker/ReasoningControl/ControllerInstructions; model-catalog.test.ts, studio-models.spec.ts, studio-agent.spec.ts, test_openrouter.py (catalog/custom IDs/default serialization) |
| `Workflow.speech` | 04 Speech + 15 Connection configuration; credentials themselves are outside YAML | 2 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Workflow.nodes` | 05 Workflow > Add/Remove/Convert steps; 22 Step settings; reference-aware node ID rename | 2 | Implemented: inspector/composer commands; authoring-commands.test.ts, editor-commands.test.ts, studio-authoring.spec.ts and studio-shell.spec.ts (actual exports, route identity/order, CRUD and Undo) |
| `Workflow.requests` | 21 Advanced > Task memory / 23 Task settings; add/rename/remove with reference validation | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.confirmations` | 21 Before actions run > Edit rule / 23 Confirmation; IDs and shared bindings in Advanced | 2 | Implemented: staged settings; shared-rule, reference, export/backend and Undo regressions in studio-settings-dialogs.spec.ts and settings-edits.test.ts |
| `Workflow.evaluation_prompt` | 18 Stage controller > Controller instructions | 3 | Implemented: ModelPicker/ReasoningControl/ControllerInstructions; model-catalog.test.ts, studio-models.spec.ts, studio-agent.spec.ts, test_openrouter.py (catalog/custom IDs/default serialization) |
| `Models.reasoning: default` and expanded efforts | 11 Compact slider / reset | 3 | Implemented: ModelPicker/ReasoningControl/ControllerInstructions; model-catalog.test.ts, studio-models.spec.ts, studio-agent.spec.ts, test_openrouter.py (catalog/custom IDs/default serialization) |
| `Speech.pronunciations` | 04 Word → Say as | 4 | Implemented: SpeechSettings and voice/term/pronunciation editors; studio-speech.spec.ts, test_pronunciations.py, test_voice_catalog.py (form/export, custom/inactive variants, synthesis identity and discovery) |
| `Pronunciation.word` | 04 Word → Say as > Word | 4 | Implemented: studio-speech.spec.ts imports/edits/exports rules; test_pronunciations.py covers split chunks, boundaries and identity |
| `Pronunciation.say_as` | 04 Word → Say as > Say as | 4 | Implemented: studio-speech.spec.ts imports/edits/exports rules; test_pronunciations.py covers split chunks, boundaries and identity |

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

## Models and controller checkpoint — 2026-11-12

Paper screens 02/11/18 now drive the searchable catalog picker, compact effort control and controller editing. Both roles use the same public OpenRouter metadata. Current/custom model IDs remain editable during outages; prices distinguish zero from unknown, show USD input/output per million tokens and request charges, and display freshness. Logos are bundled from pinned [Lobe Icons](https://github.com/lobehub/lobe-icons); unfamiliar providers use an unbranded fallback.

Effort choices follow reported capabilities; mandatory reasoning excludes None. Reset writes `default`, and missing defaults have no invented thumb position. Changing a model preserves and flags an unsupported saved override. Controller effort remains the separately configured runtime minimal setting, with compatibility guidance; no extra controller-effort setting was introduced. Expanded workflow guidance edits the same `evaluation_prompt`, without replacing built-in rules.

Checks: 137 frontend tests, 48 browser tests, production build, Ruff and diff checks passed. Browser evidence includes offline/custom IDs, stale catalog, large-list scrolling, keyboard selection, focus return and 1280/1024 layouts. Screenshots of the picker, reasoning and expanded controller were inspected. An earlier full run failed three obsolete dropdown locators; their intentional slider/dialog replacements have dedicated coverage and the subsequent full run passed. Backend behavior is unchanged in this UI slice; its latest full run remains 256 passing tests. Speech and remaining authoring/debug coverage are still pending.

## Speech checkpoint — 2026-11-12

Read Paper 04/20 directly. Separate STT/TTS panes, recognition tokens, pronunciation rows and an anchored voice popover are implemented. TTS owns its scroll. All Speech/endpoint properties have structured controls, with inactive imported variants labelled in Advanced. Recognition hints remain inactive for LiveKit and active for Direct Deepgram. Simple literal pronunciation rules now affect both synthesis paths while original generated text, tool arguments and delivery identity remain intact.

Voice suggestions require no additional provider key for Inference. Cartesia plugins can discover account voices using the session key, with bounded metadata requests, pagination and no shared authenticated cache. Existing/custom voice IDs remain editable; stale searches are discarded, keys stay out of storage/exports, and no audio preview runs automatically. Direct Deepgram's fixed voice is explained rather than presenting an ineffective chooser.

Checks: 280 backend tests, 139 frontend tests, production build, Ruff/diff checks passed. Full browser suite passed 53 tests; after spacing refinements, all seven speech checks passed, including added 1280×720 and 1024×640 keyboard/viewport cases. Screenshots of the two panes, anchored/flipped chooser and smaller layout were inspected. A shared download-helper extraction initially missed a fixture's readFile import; restored it, verified the case, and the following full browser run passed. Voice acceptance with real providers remains separate and pending.

## Graph authoring and Knowledge checkpoint — 2026-11-12

Steps can be inserted or added independently, including extending a terminal-only workflow. Connections expose label, execution rule, result binding, destination, timing, ID and YAML order separately. Required action results cannot lose their final connection. Source comments and untouched prompt formatting remain intact; renames/removals update presentation references atomically with Undo. Shared destinations stay joined; target line/chip hints are honoured. Group annotations are preserved with an explicit notice that boxes are not drawn. Business result IDs stay neutral; only unknown is amber, with explanatory text.

Knowledge inspection is now read-only and independent of unrelated Python action-contract errors. Full validation and test startup remain strict. Current schema/path-valid knowledge uses the real retriever; malformed or unsafe drafts can show an explicitly labelled prior valid configuration with mutation/retrieval disabled. Current invalid paths are never used as fallback. Loading, unavailable, empty, stale and populated states are distinct. Collection ID/path edits update scope/name references in one Undo transaction. Delayed responses after collection changes are discarded.

Checks at this checkpoint: 284 backend, 152 frontend, build and Ruff passed; 16 focused authoring/Knowledge/YAML browser cases passed. Actual action, connection, independent repair and Knowledge screenshots inspected. Subsequent debug work changes the head and requires its own final checks.

## Debug and definition-detail checkpoint — 2026-11-12

Test & debug has a dedicated conversation/runtime-summary layout based on Paper 08. Current step, collected facts, observed blockers and timeline remain visible together. A narrow confirmation_withheld runtime event exposes rejected approval reasons without changing authorization decisions. Readback interruption notices bind to exact message identities; generated conversation text never supplies action status. Structured rule/step links return to the captured workflow. Existing raw-event and receipt views remain available.

Collected data and Tools now use Paper 06/07 list/detail layouts, with independent pane scrolling. Fields expose description, type, source-backed choice tokens and reference-safe IDs; inactive Boolean choices remain reachable and explained. Tool contracts stay read-only and show action-step links, including imported/unregistered contracts.

Verification so far: 285 backend and 154 frontend tests, build, Ruff; five debug/recovery browser cases and focused data/settings checks. A first full browser run passed 64 cases but failed on a Playwright artifact file after an overlapping invocation cleared the shared output directory; it is not counted as a green full run. Final runs must be sequential. No paid voice acceptance, push, remote CI or deployment is implied.

## Whole-rollout verification before independent review

Code head `9b9211f`: Ruff, **285 backend tests**, **154 frontend tests**, production build, **69 browser tests** (one worker, sequential invocation), local retrieval evaluation and diff checks passed. The browser suite includes both bundled Northline edits and a combined repair flow: field rename → shared confirmation edit → action input/result destinations → exact exported YAML → Python compilation with the application’s real tool registry → Undo/Redo → reopen. Nested All/Any/Not, boolean false/true and ambiguous string `on` survive export/backend parse and reopen.

Current screenshots inspected at 1440/1280/1024 and compact CSS viewports include models, speech/popover, prompt/connection/action inspectors, repair, Knowledge, independent field/tool panes, debug, YAML recovery and export. This establishes deterministic UI behavior, not semantic or acoustic quality with live providers. Tests intentionally isolate paid inference.

All 23 artboard groups and all supported executable bindings have visual paths. The table distinguishes implemented controls from the evidence that exercises them; an inventory row alone is never a test. Remaining release gates: one independent whole-rollout review and any required fix pass. No remote CI at this local head, deployment or merge-readiness is claimed.

## Final review fix-pass verification

Code head `686b19a`: **293 backend tests**, **159 frontend tests**, **72 sequential browser tests**, production build, Ruff, retrieval evaluation and diff checks passed. The independent review found three Important issues; all are fixed with regressions that failed first. No Critical issue was confirmed. See the [review response, deferred minors and complete decision record](2026-11-12-studio-ux-final-review.md).

Coverage now includes omitted task-field defaults without loss of recovery UI; frontend/compiler refusal of nonliteral readback placeholders plus public-runner execution of supported IDs; complete staged Conversation-to-Action and End-to-Conversation conversion; editable retained action values; explicit Apply before Save; and one Undo transaction. The 1024px staged-action screenshot was inspected after the fix.

This is local UI-rollout completion with two documented minor follow-ups. Live-provider M2 acceptance, real browser zoom/cross-browser/AT verification, remote CI, publishing and deployment remain separate. No push or deployment was performed.
