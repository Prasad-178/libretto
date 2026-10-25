# Libretto: YAML voice workflow engine

Date: 2026-10-25

Status: proposed design for user review; implementation has not started.

## Purpose and decisions already made

The user selected **Libretto** as the project name. The engine is the main project; the generic receptionist is its first demo. A separate name for the demo has not been selected.

Build a reusable YAML-driven voice workflow engine. A generic receptionist is its first complete example, rather than the engine being incidental to a single demo. The engine supports distinct conversational stages with focused prompts, tools, knowledge, and completion/transition rules, while retaining shared identity and conversational continuity.

The user chose the more complex receptionist workflow, requested real retrieval-augmented generation (RAG), offered an OpenRouter key, suggested Deepgram transcription and a fast model such as Gemini 3.5 Flash, and authorized initializing Git here with regular implementation commits.

The user subsequently specified English only for the current release, including English transcription/context hints, and reiterated regular commits throughout implementation.

The intended reader/user is a developer building conversational workflows. The eventual portfolio article should explain the runtime, the limits of deterministic control, and findings from this independent experiment. The article's thesis, outline, and results remain undecided.

All public material must be original to this project or supported by public documentation. Use synthetic company facts, contacts, documents, prompts, scenarios, and traces. Do not reuse private application code, prompts, datasets, configuration, measurements, or implementation history. The existing local research file is untracked and is not a publication artifact.

## Proposed scope and builder choices

These are assistant recommendations, not additional user decisions:

- Python package for the engine, Pydantic schema validation, a small FastAPI service, and a React/TypeScript browser client built with Vite. Exact supported versions are to be pinned during implementation.
- The engine is independent of the HTTP service, voice adapter, and example business. Text and voice submit the same committed-turn input to the same runtime.
- Single-user local development, English only for this release, browser microphone and playback, typed chat, a read-only graph, and an inspector. Bind the backend to localhost by default. Multilingual behavior and language switching are outside the current acceptance scope.
- YAML is the source of truth; render the graph from its validated intermediate representation. No visual workflow editor in the first release.
- One provider family initially: OpenRouter for interpretation, response generation, transcription, and speech. Provider interfaces allow later direct streaming speech adapters without changing the graph engine.
- Public demo actions simulate transfers and save synthetic messages locally. They do not initiate telephone calls, contact anyone, send messages, or use live account data.
- Real passage retrieval from example Markdown documents, with local indexing and traceable source passages. No external vector database is required.
- Sequential interpretation and response generation first. A separately selectable speculative mode follows only after the baseline and draft/commit boundary are verified. It is part of the intended experiment, not a prerequisite to the first working vertical slice.

## What the engine guarantees

The runtime owns the active stage, permitted transitions, schema-valid state, capabilities exposed at a stage, action prerequisites, tool dispatch, and tool-result branching. A model cannot invent a new destination node or grant itself access to an unavailable tool.

Models interpret meaning and propose changes. That interpretation can be wrong. Evidence quotes and extracted values can also be wrong, so evidence is inspectable rather than described as proof. Generated wording is not deterministic. RAG improves access to source material but does not guarantee a correct answer.

Every committed user turn has an identity and state revision. State changes are validated before they become authoritative. Tool dispatch verifies the current revision, active stage, and prerequisites. Duplicate turn submission and duplicate action dispatch use idempotency keys. An interrupted or cancelled draft cannot mutate authoritative state or execute a business action. Do not claim exactly-once execution against arbitrary external systems; the local mock store can enforce deduplication transactionally.

## YAML contract

The configuration contains a schema version, workflow ID, start node, shared instructions, models, voice settings, typed state fields, named knowledge sources, registered tool bindings, node definitions, and transition policies.

Support four explicit node types initially:

1. `conversation`: multi-turn conversation with a stage objective, completion criteria, allowed fact updates, relevant semantic conditions, knowledge/tool allowlists, and entry behavior (`wait` or `respond`).
2. `action`: invoke one registered tool after validating typed arguments and prerequisites; route by an enumerated tool result, including timeout/error.
3. `say`: speak literal text or a template over validated state without a new interpretation step. Templates cannot execute code.
4. `end`: mark the session complete after permitted final output.

Field collection uses a conversation node with required typed fields, validation and explicit confirmation rules. It does not need a separate collection engine. Nodes may override model/effort, but inherit shared defaults when omitted.

Transitions are either semantic condition IDs proposed by the evaluator, simple typed state predicates, or tool-result edges. Use a small predicate language (`equals`, `exists`, `all`, `any`, `not`); never evaluate arbitrary Python or JavaScript from YAML. Unknown keys, duplicate YAML keys, invalid types, missing node/tool/knowledge references, and unsupported versions fail validation. Use a safe YAML parser with input size/depth limits.

Order outgoing edges explicitly. Evaluate deterministic predicates before eligible semantic edges according to the declared priority. If several semantic edges match, follow declared priority and record all matches. In the receptionist, ambiguous user intent produces clarification rather than silently selecting a department. Define an explicit fallback for every nonterminal node. Reject unreachable nodes; warn about nodes with no possible path to an end, and enforce a per-turn automatic-transition limit against cycles.

Tools are registered Python implementations with input/output schemas, a read-only versus side-effect classification, timeout, and retry policy. YAML selects bindings and permitted use; it cannot import arbitrary modules. A conversation model may request an allowed read-only tool. Business effects execute only through action nodes. Retry a write only when its adapter provides idempotency; an uncertain outcome is an explicit result requiring reconciliation, not assumed success.

Loading an edited YAML creates a new immutable workflow version. Existing sessions keep their original version; Apply starts a fresh session. No live migration of in-flight conversations in the first release.

## Stage prompt composition and model responsibilities

Compose the active speaking context from:

1. Stable shared identity, style, and behavioral rules.
2. The active stage's objective, boundaries, completion rules, and exposed tools.
3. Relevant history and typed state, with values and their source turns.
4. Retrieved passages and fresh read-only tool results as clearly marked data.

Do not concatenate instructions for every other stage into the current stage prompt. A node is a configuration/stage boundary; it need not create another process or a separate persistent agent.

Use an independently configurable evaluator for committed turns that require interpretation. One compact structured request receives the relevant context, typed fields it may update, current stage, and eligible semantic conditions. It returns field proposals, source quotes/turn IDs, statuses, matched condition IDs, and a short transition rationale. Validate the result, commit accepted facts, choose an allowed transition, complete bounded deterministic nodes, retrieve if needed, then generate the response appropriate to the resulting stage. No evaluator call is necessary for a purely deterministic tool-result branch.

Facts can be missing, supplied, declined, or conflicting. Capture multiple facts from one answer, preserve corrections, and clarify unresolved contradictions. Track confirmation separately from merely hearing a value. A changed destination/message/contact invalidates dependent confirmation. Never infer a callback number or user consent from general willingness to continue talking.

Malformed evaluator output triggers at most one bounded repair; otherwise retain current state and ask a narrow clarification. Provider errors yield an inspectable failure and a retry option. Never manufacture completion. Use bounded response/tool loops and bounded context with an explicit, tested policy when histories grow; do not silently discard unconfirmed message details.

## Receptionist example

Create a fictional software company's front desk with a synthetic directory and knowledge base. The following are stages of one logical assistant with a consistent voice:

| Stage | Behavior and permitted capabilities |
| --- | --- |
| Greeting and identify intent | Greet once; interpret information, destination, or message requests; clarify ambiguity; capture volunteered details. |
| Answer FAQ | Search the knowledge base; answer from retrieved passages or admit the missing information; preserve any unfinished task. |
| Find destination | Look up the structured directory; resolve department/person ambiguity and confirm a concrete destination. |
| Transfer action | Attempt one mock transfer using the confirmed destination; branch on connected, unavailable, failed, timeout, or unknown outcome. |
| Take message | Gather recipient, name, callback number, and message; confirm a summary; accept corrections; offer an explicit decline path. |
| Save message action | Validate confirmed fields, save once, and return a receipt or failure. |
| Wrap up | Explain the actual outcome; continue to identify intent if the caller has another request; otherwise end. |

Transfer unavailability offers message taking; it does not assume consent to leave one. Message saving requires confirmation of the current summary. A successful save requires a receipt, and an error must not become a spoken success. Mock transfer outcome can be selected in the demo controls. A connected mock transfer ends the simulated receptionist interaction after an appropriate handoff statement; the simulation is clearly labelled in the UI.

An FAQ detour can interrupt destination-finding or message collection. Preserve a bounded return frame containing the source stage and relevant task state, answer the question, then resume the unfinished task. Allow one detour level initially. Repeated FAQ questions stay within the FAQ node; a new primary request can replace a pending task only after explicit clarification where necessary. Global stop/cancel requests terminate or abandon the current task according to a runtime rule rather than relying on every node to implement it separately.

Directory entries and transfer status are exact structured lookups, not document retrieval. Business facts live in the knowledge documents. Initial content covers hours/location, services, support scope, accessibility, and contact policy. Do not add sensitive account access, identity verification, or payment processing to this example.

## RAG behavior

RAG means indexing documents and selecting relevant passages at query time, rather than attaching the whole knowledge base to each prompt. Start with local Markdown ingestion, section-aware chunking, and local lexical retrieval using SQLite FTS5/BM25. This avoids an additional embedding credential, keeps indexing reproducible, and is an honest lexical RAG baseline. Dense/hybrid retrieval is a later measured option, not an implied property of the initial system.

Each source passage includes document ID, heading, chunk ID, and content hash. Preserve the query, returned passage IDs, scores, index version, and retrieval duration. Limit passage count and total context size. Knowledge is scoped per stage. The initial receptionist retrieves on entry to the FAQ stage and on each substantive FAQ follow-up, not on contact collection or an action-result branch.

If retrieval returns no usable evidence, say the knowledge base does not cover the answer and offer clarification or message taking. Establish matching/abstention behavior with the example dataset; a lexical score alone is not calibrated confidence. Retrieved text is untrusted reference material and cannot override runtime rules, alter the graph, or authorize tools. Store source attribution in the inspector rather than reading URLs or chunk IDs aloud.

## Provider and voice plan

Public provider documentation and the unauthenticated OpenRouter catalog were checked on 2026-10-25. This establishes documented/catalog availability, not successful authenticated integration:

- Speaking and evaluator model default: `google/gemini-3.5-flash` through OpenRouter, independently configurable per role; request minimal reasoning where the active provider supports it. Start with the same model for both roles to avoid changing two variables; compare a smaller evaluator later.
- STT default: `deepgram/nova-3`, listed by `/api/v1/models?output_modalities=transcription`.
- English is the configured STT language where supported, and all shared/stage prompts and the selected TTS voice use English. YAML may supply global and stage-specific speech hints for synthetic names, department names, product terms, and spelled callback details. Use a typed hint list rather than allowing hints to override system instructions. Pass language/keyterm/context hints only through verified adapter-supported fields; otherwise expose the unsupported capability in validation/the inspector rather than silently claiming the hints are active. Keep prompt vocabulary and directory aliases consistent with these hints. Hints bias recognition; they do not establish a fact, resolve an ambiguous recipient, or bypass confirmation. Provide a patient collection setting for names and spelled details, with push-to-talk available when automatic endpointing cuts a speaker off.
- TTS first candidate: `deepgram/aura-2`, listed by `/api/v1/models?output_modalities=speech`. Confirm supported voice/output-format fields before enabling it. Use a documented available TTS alternative through the same adapter if integration reveals a capability mismatch; record and disclose the change.
- OpenRouter transcription documentation specifies completed-audio HTTP requests. It does not establish live Deepgram WebSocket transcription. The initial one-key mode captures an utterance, submits it for transcription, then runs the engine. Label this mode accurately and include endpointing/upload/transcription delay in timings.
- Provide push-to-talk as a reliable baseline and automatic local endpointing for hands-free turns. Exact VAD library and audio format are builder choices to be verified for browser compatibility before dependency selection. Expose endpointing behavior so long pauses and spelled callback numbers can be tested.
- Stream model text, emit sufficiently complete speech chunks in order, and stream or progressively play the TTS audio where the verified format permits. Do not claim full-duplex text-input TTS just because an HTTP response body streams bytes. A buffered compatibility path must be visible in the inspector and metrics.
- Local microphone activity/manual interrupt stops playback and cancels stale pending text/audio. Correlate all server events and audio chunks with turn/revision IDs, and discard stale output. Test echo behavior with headphones first; enable browser echo cancellation where available. Never label interruption as a rollback of a completed action.
- Direct Deepgram streaming STT/TTS is a later adapter option requiring its own credential. It must not be silently selected when only an OpenRouter key is configured.

Keys are read on the backend from an ignored `.env`, never placed in browser bundles, YAML, commits, logs, or traces. `.env.example` contains names/placeholders only. Configure a maximum output size, bounded turns/tool loops, provider timeouts, and a configurable per-session request cap. Use reported usage/cost when supplied; otherwise mark cost as unavailable or estimated, never invent a charge. The user has offered a key but none has yet been configured. Live provider validation waits for that key; automated tests use fakes.

## Drafts, commits, and optional overlap

Baseline sequencing is deliberately explicit: committed transcript -> interpretation -> validated state/transition -> required retrieval/read-only tool -> destination response -> audio. Business action nodes dispatch only when prerequisites are satisfied on committed state.

After the baseline, an experimental parallel mode may generate a read-only tentative response while evaluating the same turn. Release it only if its expected stage, state revision, knowledge, and tool results still match. Discard and regenerate if they do not. No draft may persist messages, update authoritative business state, or execute actions. If the transition or answer requires fresh retrieval/tool results, wait for them. Record discarded generation, additional cost, and release-buffer delay. Speech speculation before a transcript is committed is deferred until a streaming STT adapter exists.

Record assistant text that was generated separately from what was actually played. On interruption preserve a delivered-prefix/interruption marker in conversational history so the next reply does not assume the caller heard the entire draft.

## Browser demo and developer interface

The demo provides text and microphone inputs, reset/start, transcript, current stage, generated read-only graph, editable configuration selection, and mock transfer outcomes. The inspector shows the effective stage prompt/tool list, fact proposals and accepted state, transition rationale, retrieved sources, tool inputs/results, provider/model configuration, and timing events. Keep these technical details in the developer inspector; the caller hears a natural conversation.

CLI commands will validate a workflow, inspect/export its normalized graph, run scripted text scenarios, index example documents, and start the local demo. Exact command names are builder choices. Configuration errors should identify the relevant node/key and fail before accepting a call. Add one tiny second workflow fixture to prove that engine control logic is not hardcoded to the receptionist; it does not need a second polished demo.

Session state, messages, traces, and local indexes live under ignored local storage. A single-process SQLite store supports reproducible inspection and atomic mock-action deduplication. Exports require an explicit local action and contain no keys. Multi-tenant isolation, authentication, remote deployment, distributed execution, real telephony, and a general integration marketplace are outside the initial scope.

## Acceptance and evidence

Functional acceptance:

- Editing YAML changes prompts, stage tools, transitions, and knowledge scope without engine edits.
- Invalid graphs/bindings fail validation; unavailable actions cannot execute even if the model requests them.
- FAQ answers retrieve actual source passages; unsupported questions use a clear fallback.
- A transfer succeeds, fails, or becomes unavailable along explicit branches; message saving returns a real local receipt.
- Multi-field input, corrections, refusals, ambiguous recipients, detours/resume, new requests, stop/cancel, and wrap-up work.
- Duplicate turns/action requests cannot create duplicate saved messages. Timeouts/uncertain action outcomes do not produce false confirmations.
- Text and voice use the same runtime. Playback interruption cancels stale output; fresh turns cannot release old audio or stale model output.
- English names, department/product terms, spelled details, and long pauses are covered in voice scenarios. The inspector reports which language/hint settings the active adapter actually applied.
- Prompt injection in retrieved material cannot change tool permissions or permitted graph edges.
- The tiny second workflow runs without receptionist-specific changes in the engine.

Verification consists of focused schema/runtime tests, mocked provider contract tests, end-to-end scripted receptionist scenarios with state/action assertions, and a browser check for the actual microphone/playback path. Live text, STT, and TTS smoke checks are separate from fake-provider tests and require the configured key. The final status must identify anything that has not been exercised against a provider.

Capture input acoustic end (or the actual available approximation), endpoint detection, upload/transcription, transcript commit, evaluator completion, transition, retrieval, model request/first usable text, first TTS request, audio receipt, browser playback onset, completion, and cancellation. Use monotonic timestamps per process and correlated browser/server events; do not subtract unsynchronized clocks. Measure filler separately if ever introduced. No latency target or improvement percentage is promised before measurement.

Report sample counts, configuration/index versions, mode, model/provider, and cold/warm conditions alongside percentiles. Compare sequential and parallel modes under otherwise matched conditions and record routing mistakes, repeated questions, retrieval failures, discarded drafts, and reported cost. Keep enough raw traces to reconstruct claims. A handful of successful calls is a smoke test, not a benchmark.

## Delivery sequence and Git

1. Review this design and resolve material choices; then create an implementation plan.
2. Implement the validated YAML schema, provider-independent runtime, fake adapters, tiny fixture, and consequential invariant tests.
3. Complete the text receptionist with real local retrieval and transactional mock tools.
4. Integrate OpenRouter, then browser voice and interruption handling.
5. Add the graph/inspector, scenario runner, and reproducible evidence export.
6. Verify the baseline; add and compare the bounded parallel experiment if still justified.
7. Use findings to prepare the article brief and approved outline before drafting.

Initialize Git in this directory. Commit coherent milestones and keep required hooks/checks enabled. Review the staged file list and diff before every commit. Never stage private research, credentials, recordings, generated indexes, or incidental session data. Commit messages describe real changes; do not imply provider validation or completed features before they exist.

Make regular commits throughout implementation: schema/runtime, text receptionist and retrieval, provider integration, voice, inspector, and fixes should each have reviewable commits as they become coherent and appropriately verified. Do not leave the whole implementation for one final commit. These are suggested milestone boundaries, not a requirement to wait until an entire subsystem is finished before committing a smaller complete change.

## Public references

- ElevenLabs workflow representation and stage configuration: https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows
- LiveKit workflow constructs: https://docs.livekit.io/agents/logic/workflows/
- OpenRouter Gemini 3.5 Flash and structured output/tool capabilities: https://openrouter.ai/google/gemini-3.5-flash/providers
- OpenRouter transcription request/response semantics: https://openrouter.ai/blog/tutorials/transcription-on-openrouter/
- OpenRouter speech endpoint and incremental HTTP output: https://openrouter.ai/blog/tutorials/text-to-speech/
- Public speech/transcription catalogs: https://openrouter.ai/api/v1/models?output_modalities=speech and https://openrouter.ai/api/v1/models?output_modalities=transcription
- Direct Deepgram streaming TTS interface: https://developers.deepgram.com/reference/text-to-speech/speak-streaming

Public sources describe those products, not measurements of this implementation. Recheck relevant request contracts and supported versions during integration.
