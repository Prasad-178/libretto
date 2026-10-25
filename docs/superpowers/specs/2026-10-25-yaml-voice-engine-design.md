# Libretto: YAML voice workflow engine

Date: 2026-10-25

Updated: 2026-10-26 after public documentation research and further scope discussion.

Status: proposed design for user review; implementation has not started.

## Purpose and decisions already made

The user selected **Libretto** as the project name. The engine is the main project; the generic receptionist is its first demo. A separate name for the demo has not been selected.

Build a reusable YAML-driven voice workflow engine. A generic receptionist is its first complete example, rather than the engine being incidental to a single demo. The engine supports distinct conversational stages with focused prompts, tools, knowledge, and completion/transition rules, while retaining shared identity and conversational continuity.

The user chose the more complex receptionist workflow, requested real retrieval-augmented generation (RAG), offered an OpenRouter key, suggested Deepgram transcription and a fast model such as Gemini 3.5 Flash, and authorized initializing Git here with regular implementation commits.

The user subsequently specified English only for the current release, including English transcription/context hints, and reiterated regular commits throughout implementation.

The user wants hosting itself to remain free, accepts paid API usage, and offered a subdomain of `prasadjs.me`. The user proposed in-memory storage for short conversations. The current recommendation is an ephemeral, database-free demo with a bounded call lifetime, subject to confirmation of session-reset behavior and access to a direct Deepgram key. Speech-provider recommendations below were revised after checking current streaming and turn-detection documentation; they are not claims of successful integration.

The intended reader/user is a developer building conversational workflows. The eventual portfolio article should explain the runtime, the limits of deterministic control, and findings from this independent experiment. The article's thesis, outline, and results remain undecided.

All public material must be original to this project or supported by public documentation. Use synthetic company facts, contacts, documents, prompts, scenarios, and traces. Do not reuse private application code, prompts, datasets, configuration, measurements, or implementation history. The existing local research file is untracked and is not a publication artifact.

## Proposed scope and builder choices

These are assistant recommendations, not additional user decisions:

- Python package for the engine, Pydantic schema validation, a small FastAPI service, and a React/TypeScript browser client built with Vite. Exact supported versions are to be pinned during implementation.
- The engine is independent of the HTTP service, voice adapter, and example business. Text and voice submit the same committed-turn input to the same runtime.
- Local development followed by a small personal demo targeting Vercel Hobby at `libretto.prasadjs.me`. English only for this release, browser microphone and playback, typed chat, a basic read-only graph, and an inspector. Bind the local backend to localhost by default. Multilingual behavior and language switching are outside the current acceptance scope.
- YAML is the source of truth; render the graph from its validated intermediate representation. No visual workflow editor in the first release.
- Recommended providers: OpenRouter for interpretation and response generation; direct Deepgram for streaming transcription/turn detection and streaming TTS. This requires two keys. An OpenRouter-only completed-utterance path remains a documented alternative, not a second mandatory implementation in the first sprint.
- Public demo actions simulate transfers and capture synthetic messages in session memory. They do not initiate telephone calls, contact anyone, send messages, or use live account data. A captured message disappears when the session ends; the UI must not imply durable delivery.
- Real passage retrieval from example Markdown documents, with local indexing and traceable source passages. No external vector database is required.
- Sequential interpretation and response generation first. The first prototype is complete with the verified sequential baseline and does not require implementing or benchmarking speculative generation. A separately selectable parallel mode is an intended follow-up experiment after the draft/commit boundary is verified, subject to a separate scope decision.

## What the engine guarantees

The runtime owns the active stage, permitted transitions, schema-valid state, capabilities exposed at a stage, action prerequisites, tool dispatch, and tool-result branching. A model cannot invent a new destination node or grant itself access to an unavailable tool.

Models interpret meaning and propose changes. That interpretation can be wrong. Evidence quotes and extracted values can also be wrong, so evidence is inspectable rather than described as proof. Generated wording is not deterministic. RAG improves access to source material but does not guarantee a correct answer.

Every committed user turn has an identity and state revision. State changes are validated before they become authoritative. Tool dispatch verifies the current revision, active stage, and prerequisites. Duplicate turn submission and duplicate action dispatch use idempotency keys. An interrupted or cancelled draft cannot mutate authoritative state or execute a business action. A session actor/lock serializes changes and deduplicates mock actions within that live session. Deduplication does not survive a process restart; do not claim durable exactly-once execution or message delivery.

Every accepted speech-start, manual interrupt, or newer submitted text turn increments a session work epoch. Evaluation, retrieval, generation, and pending actions carry their originating epoch. On interruption, cancel in-flight work and prevent stale proposals from committing facts or dispatching any not-yet-dispatched action. Serialize the epoch check and action dispatch/commit boundary with session changes; do not hold that lock across model/network waits. Facts already committed remain until an accepted correction replaces them, and an action already dispatched is tracked by its actual result rather than treated as rolled back. Clear stale playback separately. These rules apply to the sequential baseline as well as future speculation.

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

This is the semantic evaluator discussed for parallel routing. Its role is independent of its scheduling: the initial baseline awaits it before speaking generation, and the optional parallel experiment overlaps that same evaluator with a read-only tentative response. The evaluator can propose an FAQ detour and a contextual search question in its structured output, without adding another classifier or query-rewriter call. It never directly sets an arbitrary active stage or executes an action; the controller validates permitted condition IDs and applies graph policy.

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
| Save message action | Validate confirmed fields, capture once in session memory, and return a session-only receipt or failure. |
| Wrap up | Explain the actual outcome; continue to identify intent if the caller has another request; otherwise end. |

Transfer unavailability offers message taking; it does not assume consent to leave one. Message saving requires confirmation of the current summary. A successful save requires a receipt, and an error must not become a spoken success. Mock transfer outcome can be selected in the demo controls. A connected mock transfer ends the simulated receptionist interaction after an appropriate handoff statement; the simulation is clearly labelled in the UI.

An FAQ detour can interrupt destination-finding or message collection. Preserve a bounded return frame containing the source stage and relevant task state, answer the question, then resume the unfinished task. Allow one detour level initially. Repeated FAQ questions stay within the FAQ node; a new primary request can replace a pending task only after explicit clarification where necessary. Global stop/cancel requests terminate or abandon the current task according to a runtime rule rather than relying on every node to implement it separately.

Define global controls consistently: an explicit end-call request/button ends the session; cancel-this-request abandons the pending task and its dependent confirmations/return frame, then returns to identify intent while keeping conversational history; stop-talking interrupts output and keeps task state while listening. A bare ambiguous stop first interrupts speech and blocks pending actions, then clarifies what the caller wants before ending the session or abandoning the task. Cancelling a task never erases an already completed action or its receipt.

Directory entries and transfer status are exact structured lookups, not document retrieval. Business facts live in the knowledge documents. Initial content covers hours/location, services, support scope, accessibility, and contact policy. Do not add sensitive account access, identity verification, or payment processing to this example.

## RAG behavior

RAG means indexing documents and selecting relevant passages at query time, rather than attaching the whole knowledge base to each prompt. Start with local Markdown ingestion, section-aware chunking, and an in-memory lexical BM25 index built from bundled synthetic documents. This needs neither a database service nor an additional embedding credential, keeps indexing reproducible, and is an honest lexical RAG baseline. Dense/hybrid retrieval is a later measured option, not an implied property of the initial system.

Each source passage includes document ID, heading, chunk ID, and content hash. Preserve the query, returned passage IDs, scores, index version, and retrieval duration. Limit passage count and total context size. Knowledge is scoped per stage. The initial receptionist retrieves on entry to the FAQ stage and on each substantive FAQ follow-up, not on contact collection or an action-result branch.

Make the retrieval policy explicit in YAML (for example, required retrieval for the FAQ stage and no knowledge source in message collection). A factual company question routes to FAQ using the same semantic evaluator, including when it interrupts another task. Always search for substantive FAQ questions, even if a classifier suspects they are out of scope; inspect passages and abstain when evidence is insufficient. Pure acknowledgments and corrections to contact details do not require document search. The decision to search is distinct from judging whether retrieved text supports an answer; do not use a keyword-only gate or claim BM25 scores are calibrated confidence. Contextual follow-ups use recent question context and the evaluator's bounded search-question field. Log the retrieval trigger/skip reason.

If retrieval returns no usable evidence, say the knowledge base does not cover the answer and offer clarification or message taking. Establish matching/abstention behavior with the example dataset; a lexical score alone is not calibrated confidence. Retrieved text is untrusted reference material and cannot override runtime rules, alter the graph, or authorize tools. Store source attribution in the inspector rather than reading URLs or chunk IDs aloud.

## Provider and voice plan

Public provider documentation and the unauthenticated OpenRouter catalog were checked on 2026-10-25, then direct Deepgram and Vercel documentation was checked on 2026-10-26. This establishes documented/catalog availability, not successful authenticated integration:

- Speaking and evaluator model default: `google/gemini-3.5-flash` through OpenRouter, independently configurable per role; request minimal reasoning where the active provider supports it. Start with the same model for both roles to avoid changing two variables; compare a smaller evaluator later.
- Recommended live STT: direct Deepgram `flux-general-en` on `/v2/listen`, which combines streaming transcription with model-integrated end-of-turn detection. The English model supplies the language choice. Nova-3 through OpenRouter remains a completed-audio alternative, rather than the recommended live path.
- English is the configured STT language where supported, and all shared/stage prompts and the selected TTS voice use English. YAML may supply global and stage-specific speech hints for synthetic names, department names, product terms, and spelled callback details. Use a typed hint list rather than allowing hints to override system instructions. Pass language/keyterm/context hints only through verified adapter-supported fields; otherwise expose the unsupported capability in validation/the inspector rather than silently claiming the hints are active. Keep prompt vocabulary and directory aliases consistent with these hints. Hints bias recognition; they do not establish a fact, resolve an ambiguous recipient, or bypass confirmation. Provide a patient collection setting for names and spelled details, with push-to-talk available when automatic endpointing cuts a speaker off.
- Recommended live TTS: direct Deepgram Flux TTS on `/v2/speak`, initially an English voice such as `flux-haley-en`, subject to account smoke test and listening. This is a different model family and protocol from Aura `/v1/speak`.
- Flux TTS explicitly accepts raw LLM text deltas and internally chooses synthesis boundaries. Preserve whitespace, send only committed speaking output (no evaluator JSON, tool arguments, or speculative text), and send one `Flush` when that response is complete. Do not place manual sentence flush points or invoke another model to check sentence completion. Token transport does not mean independently synthesizing each token. For an optional Aura/REST adapter, use a deterministic incremental sentence segmenter with abbreviation/decimal handling, flush the final remainder, preserve audio order, and avoid per-word requests. Do not impose that adapter's chunking rules on Flux TTS. The default path needs no extra client-side sentence-completion model.
- Flux TTS streams raw audio; use browser progressive PCM playback with a bounded queue, verified sample-rate handling, and backpressure. Correlate provider speech IDs with turn IDs. The provider's reported spoken text is useful for reconciliation but is not by itself proof that queued audio played in the browser; preserve browser playback progress and interruption markers.
- OpenRouter transcription documentation specifies completed-audio HTTP requests. If using the one-key alternative, label it accurately and include endpointing/upload/transcription delay in timings. Do not silently downgrade the live path to that mode.
- Use Flux `EndOfTurn` as the authoritative normal turn boundary rather than stacking a second fixed silence delay on it. Provide push-to-talk/manual completion through `ForceEndTurn`. Browser VAD can help local interruption responsiveness; it is not another mandatory end-of-turn timer. Exact browser capture/VAD library and resampling implementation are builder choices to verify before dependency selection.
- Initial tuning proposals, not measured best settings: ordinary intent/FAQ stages use `eot_threshold=0.75`, `eot_timeout_ms=5000`; name/callback/message-detail collection uses `eot_threshold=0.85`, `eot_timeout_ms=8000`. These timeouts are maximum-silence backstops, not waits added to every turn. Use acknowledged mid-stream `Configure` updates for thresholds and stage vocabulary. Restore the normal profile after collection. Do not enable eager EOT in the baseline. Tune against cutoffs, recovery, and audible latency using scripted pauses, unfinished clauses, accents, spelled details, and background noise; a larger threshold is not universally better.
- Speech-start/manual interrupt stops browser playback and cancels stale pending text/audio; send provider `Interrupt` and handle its lifecycle response. Correlate all server events and audio chunks with turn/revision IDs, and discard stale output. Test echo behavior with headphones first; enable browser echo cancellation where available. Never label interruption as a rollback of a completed action. Test false interruptions from backchannels and noise rather than assuming every microphone event represents a new caller request.
- Direct streaming requires `DEEPGRAM_API_KEY` alongside `OPENROUTER_API_KEY`; neither credential has yet been validated by this project. API spending is accepted by the user. Confirm direct key availability before choosing the live adapter path.

Keys are read on the backend from an ignored `.env`, never placed in browser bundles, YAML, commits, logs, or traces. `.env.example` contains names/placeholders only. Configure a maximum output size, bounded turns/tool loops, provider timeouts, and a configurable per-session request cap. Use reported usage/cost when supplied; otherwise mark cost as unavailable or estimated, never invent a charge. The user has offered a key but none has yet been configured. Live provider validation waits for that key; automated tests use fakes.

## Drafts, commits, and optional overlap

Baseline sequencing is deliberately explicit: committed transcript -> interpretation -> validated state/transition -> required retrieval/read-only tool -> destination response -> audio. Business action nodes dispatch only when prerequisites are satisfied on committed state.

After the baseline, an experimental parallel mode may generate a read-only tentative response while evaluating the same committed turn. Release it only if its expected stage, state snapshot/revision, knowledge, and tool results still match. Matching only the stage name is insufficient when extracted facts or confirmations changed. Discard and regenerate if they do not match. No draft may persist messages, update authoritative business state, execute actions, or reach the live TTS socket. If the transition or answer requires fresh retrieval/tool results, wait for them. Record discarded generation, additional cost, and release-buffer delay. Starting work before final turn commitment via Flux `EagerEndOfTurn` is a separate deferred optimization requiring `TurnResumed` cancellation handling; it is not automatically enabled by using a streaming STT adapter.

Record assistant text that was generated separately from what was actually played. On interruption preserve a delivered-prefix/interruption marker in conversational history so the next reply does not assume the caller heard the entire draft.

## Browser demo and developer interface

The demo provides text and microphone inputs, reset/start, transcript, current stage, generated read-only graph, editable configuration selection, and mock transfer outcomes. The inspector shows the effective stage prompt/tool list, fact proposals and accepted state, transition rationale, retrieved sources, tool inputs/results, provider/model configuration, and timing events. Keep these technical details in the developer inspector; the caller hears a natural conversation.

CLI commands will validate a workflow, inspect/export its normalized graph, run scripted text scenarios, index example documents, and start the local demo. Exact command names are builder choices. Configuration errors should identify the relevant node/key and fail before accepting a call. Add one tiny second workflow fixture to prove that engine control logic is not hardcoded to the receptionist; it does not need a second polished demo.

For the first demo, keep each conversation, mock message receipts, pending tasks, deduplication keys, and trace ring buffer in one session object owned by one WebSocket connection. The full text-and-audio interaction stays on that connection; do not depend on a process-global session dictionary being reachable from arbitrary HTTP requests. There is no application database or database service. Read-only bundled knowledge can be indexed once per warm instance and reused.

On Vercel, a WebSocket is pinned to one instance for its connection lifetime. Hobby's documented function maximum is 300 seconds, so cap demo calls at 240 seconds with an explicit expiry UI and bounded cleanup margin. A disconnection, restart, deployment, or expiry ends this ephemeral session; reconnection starts a fresh session with a visible reset, not an implied recovery. Captured messages are demonstration artifacts, not durable mailboxes. Offer an explicit local JSON download for traces/messages before ending a session; do not retain server recordings by default. Durable resume, long calls, and production delivery would require revisiting storage/hosting.

Target Vercel Hobby for this personal demo at `libretto.prasadjs.me`, within its included quotas. Do not promise unlimited free traffic or self-invoke functions to evade duration limits. API costs are separate and accepted. Add modest demo session/request/audio-size caps, backend-only credentials, and explicit provider error states. Public launch and DNS configuration happen after a verified preview; no hosting account, domain, or deployment has yet been modified. Multi-user account features, real telephony, and a general integration marketplace are outside the initial scope.

## Acceptance and evidence

Functional acceptance:

- Editing YAML changes prompts, stage tools, transitions, and knowledge scope without engine edits.
- Invalid graphs/bindings fail validation; unavailable actions cannot execute even if the model requests them.
- FAQ answers retrieve actual source passages; unsupported questions use a clear fallback.
- A transfer succeeds, fails, or becomes unavailable along explicit branches; message capture returns a real session-only receipt.
- Multi-field input, corrections, refusals, ambiguous recipients, detours/resume, new requests, stop/cancel, and wrap-up work.
- Duplicate turns/action requests cannot create duplicate messages within the live session. Timeouts/uncertain action outcomes do not produce false confirmations. Session expiry/reset clearly ends that guarantee and clears session state.
- Text and voice use the same runtime. Playback interruption cancels stale output; fresh turns cannot release old audio or stale model output.
- English names, department/product terms, spelled details, and long pauses are covered in voice scenarios. The inspector reports which language/hint settings the active adapter actually applied.
- Flux turn-detection configuration changes are acknowledged and visible. Verify the normal/patient profiles without unnecessary added silence timers; eager mode stays disabled in baseline tests.
- Verify progressive speech playback, whitespace across streamed text deltas, provider/browser interruption cleanup, and exclusion of control JSON from speech.
- Verify separate concurrent sessions, the 240-second demo limit, and the explicit fresh-session behavior on disconnection/reload. No fake resume or durable-message claim is allowed.
- Prompt injection in retrieved material cannot change tool permissions or permitted graph edges.
- The tiny second workflow runs without receptionist-specific changes in the engine.

Verification consists of focused schema/runtime tests, mocked provider contract tests, end-to-end scripted receptionist scenarios with state/action assertions, and a browser check for the actual microphone/playback path. Live text, STT, and TTS smoke checks are separate from fake-provider tests and require the configured key. The final status must identify anything that has not been exercised against a provider.

Capture input acoustic end (or the actual available approximation), endpoint detection, upload/transcription, transcript commit, evaluator completion, transition, retrieval, model request/first usable text, first TTS request, audio receipt, browser playback onset, completion, and cancellation. Use monotonic timestamps per process and correlated browser/server events; do not subtract unsynchronized clocks. Measure filler separately if ever introduced. No latency target or improvement percentage is promised before measurement.

Report sample counts, configuration/index versions, mode, model/provider, and cold/warm conditions alongside percentiles. Compare sequential and parallel modes under otherwise matched conditions and record routing mistakes, repeated questions, retrieval failures, discarded drafts, and reported cost. Keep enough raw traces to reconstruct claims. A handful of successful calls is a smoke test, not a benchmark.

## Delivery sequence and Git

1. Review this design and resolve material choices; then create an implementation plan.
2. Implement the validated YAML schema, provider-independent runtime, fake adapters, tiny fixture, and consequential invariant tests.
3. Complete the text receptionist with real in-memory retrieval and session-deduplicated mock tools.
4. Integrate OpenRouter, then direct Deepgram live voice and interruption handling once credentials are available.
5. Add the basic graph/inspector, scenario runner, explicit local evidence download, and a Vercel preview with bounded ephemeral sessions.
6. Verify and deliver the sequential prototype. Parallel drafting and eager-EOT generation require a later scope decision and are not prototype completion gates.
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
- Flux STT turn detection and tuning: https://developers.deepgram.com/docs/flux/configuration
- Flux STT dynamic configuration: https://developers.deepgram.com/changelog/2026/2/27
- Flux TTS streaming/client-owned turn boundaries: https://developers.deepgram.com/docs/flux-tts/quickstart and https://developers.deepgram.com/docs/flux-tts/client-messages
- Aura-specific chunking guidance and its distinction from Flux TTS: https://developers.deepgram.com/docs/tts-text-chunking
- Vercel WebSocket instance lifetime and state: https://vercel.com/docs/functions/websockets
- Vercel limits and Hobby plan: https://vercel.com/docs/functions/limitations and https://vercel.com/docs/plans/hobby

Public sources describe those products, not measurements of this implementation. Recheck relevant request contracts and supported versions during integration.
