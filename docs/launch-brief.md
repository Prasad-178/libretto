# Libretto publication brief

Status: proposed brief for discussion, not approved article copy. The working demo is already deployed at https://libretto.prasadjs.me. No article, social post or recording has been published.

## Proposed angle

**A YAML graph can constrain a voice agent's workflow without putting a routing model in front of every spoken reply.** Libretto explores that boundary: probabilistic language interpretation alongside runtime-owned state, allowed transitions, cancellation and action prerequisites.

The intended reader is a software engineer who knows basic API/LLM concepts but has not built a streaming voice pipeline. Explain end-of-turn detection, speculative generation, epochs, retrieval and playback acknowledgements in plain language at first use. The reader should leave understanding how to separate fast conversational output from authoritative workflow control, and where that separation needs explicit synchronization.

This is a working independent prototype, not a general production platform or a guarantee of deterministic language understanding. The demo data and business actions are fictional.

Working titles:

- Building a voice agent engine around a YAML file
- Keeping a voice agent on track without slowing it down
- Libretto: voice workflows, written in YAML

Recommended format: one portfolio article of roughly 1,500–2,000 words, one short X post linking the article and demo, and a captioned 90–120 second recording. Keep the project and recording available before announcing the article.

## Argument to develop after brief approval

1. Start with the concrete requirement: a receptionist that answers questions, transfers calls and takes messages while retaining its stage and earlier facts.
2. Show the small YAML definition: shared instructions, stage instructions, fields, allowed transitions, knowledge and action prerequisites. Explain what the engine enforces.
3. Follow one caller turn through retrieval and concurrent speaker/evaluator requests. Explain why interpretation is not a serial prerequisite for ordinary speech, and when authoritative actions must wait.
4. Explain interruptions and delivery: generated text is not necessarily heard text; cancel old work and reconcile playback before trusting a confirmation.
5. Use a corrected callback number to show runtime-rendered readback, confirmation invalidation and a simulated tool receipt.
6. Show the evidence and limits: repeatable tests/evaluations, timing boundaries, lexical retrieval on a small corpus, one shipped speech adapter, session-only tools and BYOK hosting.

This is a candidate structure for discussion, not the approved long-form outline. Do not write the full article or repurpose it into a launch post until its thesis and outline are agreed.

## Demo recording sequence

This is a capture plan, not a claim that a recording already exists. Use a fresh session, headphones and fictional caller details. Keep credential entry, browser chrome, unrelated tabs and personal conversation exports out of frame.

| Approximate time | Show | What it establishes |
| --- | --- | --- |
| 0–15 s | Workflow canvas, then the corresponding YAML stage/shared prompt | The workflow comes from an editable file; the canvas visualizes it. |
| 15–40 s | Start a voice call, hear Jamie's welcome, ask “What membership options do you have?” | Startup greeting and document-backed response; briefly show Sources. |
| 40–65 s | “Could I speak to Maya in billing?” Approve the transfer with the simulated outcome set to unavailable. | A stage change, guarded tool call and fallback based on its receipt. |
| 65–105 s | Agree to a message using the fictional details below; correct the number before confirming the fresh readback. | Context retention, correction handling and confirmation before capture. |
| 105–120 s | Show the saved mock receipt, state and export/timing view; end the call | Observable outcome, session-only simulation and diagnostics. |

Suggested invented details: Taylor Reed; callback `202-555-0142`, corrected to `202-555-0168`; message “Please explain the invoice line items for my demo membership.” These are example inputs; confirm the actual result while recording. Do not splice a failed action into an apparent success. If the complete conversation exceeds two minutes, shorten the presentation around it or use clearly marked cuts.

For a shorter social clip, show YAML → document-backed answer → corrected-detail readback → mock receipt. The longer recording can show the unavailable-transfer branch too. Capture first; write captions and narration around the actual observed interaction.

## Evidence ledger

| Candidate claim | Classification / source | Boundary and conditions | Publication status |
| --- | --- | --- | --- |
| Speaker and structured evaluator run concurrently. | Code and regression tests: `runtime.py`, `tests/test_runtime.py`; design evidence in `docs/evidence.md`. | Ordinary response generation uses a fixed stage snapshot; actions still wait for authoritative prerequisites. | Supported. Avoid saying that every operation is parallel or never waits. |
| YAML configures prompts, fields, stages, transitions, knowledge and speech providers. | Code: `schema.py`, `examples/receptionist.yaml`, server compilation/validation. | Only registered provider/tool implementations and bundled knowledge are selectable in the hosted editor. | Supported. A YAML file does not implement arbitrary new tools/providers. |
| The runtime enforces legal transitions and confirmation prerequisites. | Code and readback/action/correction tests. | Interpretation remains probabilistic; correct extraction and playback information matter. | Supported with this qualification. Do not call the complete agent deterministic. |
| Retrieval is real local lexical retrieval over Markdown sections. | `retrieval.py`, prompt inputs, eight curated offline evaluation cases. | Small bundled corpus; no embeddings, vector database or external search service. | Supported. Do not present tiny-corpus timings as an industry retrieval benchmark. |
| The project owns pipeline orchestration. | `speech.py`, provider contracts, browser AudioWorklets, runtime and adapter tests. | Recognition, model inference, turn detection and synthesis themselves are provider services. Deepgram is the only shipped speech adapter. | Supported with these boundaries. |
| Confirmation uses validated facts and completed delivery. | Runtime readback implementation and `tests/test_receptionist.py`. | A correction invalidates prior confirmation; voice delivery relies on playback acknowledgements. | Supported. All business deliveries here are simulations. |
| The automated suite contains 97 Python and 33 frontend tests. | Fresh local test run on 2026-10-28. | Includes concurrency, stale work, access limits, readback/action guards, audio event ordering and timing calculations. | Supported for this revision; update counts if code changes. |
| Two bounded real-model workflows passed. | Ignored local evaluation report; summary in `docs/evidence.md`. | Fictional callers; real OpenRouter requests; simulated tools; text workflow evaluation, not an acoustic benchmark. | Supported as bounded evidence, not a general quality score. |
| The user found recent conversation quality good. | User recollection in this session. | Subjective observation, not an independently scored evaluation. | Ask whether/how to include; do not convert it into a numerical result. |
| Responses reliably meet 1–1.2 second acoustic TTFS. | No sufficiently controlled multi-call dataset. | Browser estimates and endpoint-to-playback differ from acoustic-end-to-meaningful-speech latency. | Exclude this claim. It is a target, not an established result. |
| Hosting currently uses Vercel with no database and visitor API keys. | Config/deployment/access verification in `docs/evidence.md`. | Subject to platform limits; five-minute session cap. BYOK prevents spending a shared provider key, not hosting-quota consumption. | Supported for the verified deployment. Avoid “unlimited free hosting” or “impossible to exploit.” |

## Release status and remaining choices

- The demo is live. Functional UI, YAML visualization, RAG, stage control, simulated tools, welcome and timing exports are implemented.
- Secrets/history scan passed before the initial remote push; local research, credentials and raw call exports remain ignored.
- Repository CI runs lint, Python tests, offline retrieval evaluation, frontend tests and a production build without provider secrets or paid API traffic.
- A quiet physical-phone voice call, keyboard-open layout and a small set of comparable latency samples remain useful manual acceptance checks. Further live testing was deferred by the user; no broad latency conclusion is required to share the prototype honestly.
- The user authorized public repository visibility after the initial private backup. The repository is public at https://github.com/Prasad-178/libretto. A license is still a separate choice; agree on it before describing the code as open source.
- No blog or X publication is authorized by this brief. The next editorial step is a focused discussion and approval of the brief, then a concrete long-form outline.

## Questions only Prasad can answer

1. Should the article primarily teach the runtime/concurrency design, or tell the shorter build-and-demo story? Recommendation: teach the runtime, using the receptionist as the running example.
2. Which decision/result felt most surprising or worth explaining in your own words?
3. Which license should the public repository use? A permissive license may fit a reuse-oriented project; choose its terms explicitly.

## Visual and terminology plan

Use the actual workflow screenshot, a short tested YAML excerpt and one timeline diagram that distinguishes speaker output, evaluator completion and controller commits. Use the correction/receipt example to explain confirmation instead of adding another architecture diagram. Introduce RAG as retrieving relevant document passages for the answer; explain TTFS as time to the first speech output and state the measurement reference whenever quoting a number.

Keep raw logs, contact details, credentials, private research and unrelated organizations out of public artifacts. Source technical claims from the final code and relevant primary provider documentation when drafting; this brief is an internal evidence map, not the article's final reference list.
