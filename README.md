# Libretto

Voice workflows, written in YAML.

An English voice-agent prototype with a Python workflow engine and a React demo. Jamie, receptionist at the fictional Northline Workspace coworking space, answers document-backed membership and room questions, finds departments, confirms simulated transfers, recovers by taking a message, and wraps up.

The runtime enforces graph transitions, typed state, stage-scoped capabilities and action prerequisites. Models interpret the caller and generate speech; their interpretation and wording are probabilistic. A YAML graph does not make an LLM deterministic.

The studio opens on a read-only Workflow canvas generated from YAML: stage cards, routed transitions, full condition/prompt details, zoom/fit controls and live stage highlights. Edit the same definition in Agent or YAML, then return to Workflow to inspect it. During a test, the canvas shows the running snapshot; edits apply to the next test.

## Run locally

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/) and Node.js 22.12+ (Node 24 recommended).

```sh
uv sync --locked
npm --prefix web ci
npm --prefix web run build
cp .env.example .env
uv run libretto serve
```

Open http://127.0.0.1:8000. Add `OPENROUTER_API_KEY` and `DEEPGRAM_API_KEY` to `.env`, or use the masked inputs in Connection settings. Text mode needs OpenRouter; voice mode also needs a direct Deepgram key with access to Flux STT/TTS. No fake-provider fallback exists in the live demo.

For frontend development, run the backend above and `npm --prefix web run dev` in another terminal. Vite proxies `/api` and its WebSocket to port 8000.

```sh
uv run libretto validate examples/receptionist.yaml
uv run libretto graph examples/receptionist.yaml
uv run libretto evaluate
uv run libretto validate examples/minimal.yaml
uv run pytest -q
uv run ruff check src tests app.py
npm --prefix web test
npm --prefix web run build
```

## How it works

- `examples/receptionist.yaml` defines the shared prompt, typed fields, models, knowledge, stages, permitted transitions and registered actions. `examples/minimal.yaml` is an unrelated two-stage example.
- The YAML `welcome` line plays as soon as voice transport is ready, without a model request.
- Confirmation nodes can define a `readback` template. The runtime renders it from validated state, binds its fingerprint to completed delivery, and requires fresh confirmation after corrections.
- Speaking and structured evaluation run concurrently. Each generation uses a fixed stage snapshot. Valid pending transitions commit at generation boundaries; action guards wait for authoritative prerequisites and confirmation.
- Local BM25 retrieval searches Markdown sections on every nonempty input, using recent context for follow-ups and filtering sources by the active configuration. There is no preceding FAQ classifier, query-rewrite LLM or vector database. Lexical search can miss paraphrases.
- Flux STT eager signals start draft generation; matching confirmed input releases speech. Resumed speech cancels stale work. Flux TTS receives raw text deltas followed by one end-of-response Flush. There is no client sentence-boundary model.
- Browser AudioWorklets capture 16 kHz PCM and progressively play 24 kHz PCM. Epochs reject stale audio after interruption. Listening profiles allow longer pauses while collecting contact details.
- Transfers and message captures are **simulations**. Receipts exist only in the current session. They do not contact a real person or create a durable ticket.

The UI is an agent workspace with synchronized prompt forms and an editable YAML source, a bundled knowledge base, and a voice/text test panel. Apply changes validates the definition; every test uses a fixed snapshot of that YAML. Changes stay in the tab; Export YAML downloads a file. Active/pending stage, facts, passages, trace, countdown and simulated outcomes are inspectable during tests.

### Provider boundaries

Provider replaceability is a design requirement. Libretto owns streaming orchestration between microphone capture, transcription events, LLM text deltas, TTS input and browser playback, alongside its workflow/state/RAG/tool logic. OpenRouter and Deepgram currently supply the model APIs; speech recognition, Flux turn detection and synthesis segmentation run inside the speech provider.

STT and TTS now have independent contracts, normalized events and explicit capabilities. A provider-neutral coordinator owns runtime integration and browser framing; YAML selects each provider/model through a server allowlist. Deepgram is the only shipped speech implementation. Mixed test adapters verify that replacing speech transport does not require workflow/state changes. See [speech provider integration](docs/speech-providers.md) for registration, audio formats, capability fallbacks and credential bindings.

Reusable libraries or open frameworks are acceptable when provider-specific behavior remains behind replaceable adapters. Rebuilding every component from scratch is not a project requirement.

## Sessions and credentials

One WebSocket owns one in-memory conversation, capped at 300 seconds (five minutes). Disconnecting or reconnecting starts fresh. There is no database, cross-instance session lookup or durable message storage. An explicit downloaded trace contains conversation details and should be treated accordingly.

Visitor keys stay in tab memory and their backend session, over HTTPS/WSS when hosted. They are not placed in browser storage, URLs, traces or exports. Server keys stay on the backend. Provider credentials are independent; replacing an OpenRouter key does not replenish Deepgram credit. Changing keys does not restart the timer. Provider hosts are fixed in code.

For a funded public demo, use provider-side limits on dedicated low-budget keys. Session duration and in-process counters are not a global spending cap. Public Vercel deployments default to BYOK, even if provider keys are accidentally configured. A shared hosted budget requires `LIBRETTO_ALLOW_HOSTED_KEYS=true`; local .env development remains supported. API usage is billed by the providers. See [access boundaries and remaining risks](docs/security.md).

## Hosting

`app.py` is the FastAPI entrypoint. `vercel.json` builds the frontend and permits a 300-second function lifetime; the application caps calls at 300 seconds. The function lifetime also includes connection setup, so the hosting timeout can end a call slightly earlier. State stays within the one connection. Vercel Hobby is the intended hosting plan, subject to included limits. No paid hosting add-on or database is provisioned.

```sh
vercel deploy
```

Live demo: **https://libretto.prasadjs.me**. Cloudflare has a DNS-only CNAME named `libretto` targeting `4df64d3f7d5dc4a6.vercel-dns-017.com`. Vercel verifies the domain and serves HTTPS. Homepage, frontend assets, API routes and the secure WebSocket were checked on this hostname. Local research, credentials and session data are excluded by `.gitignore` and `.vercelignore`.

Vercel documents [FastAPI frontend builds and WebSockets](https://vercel.com/docs/frameworks/backend/fastapi); connections remain subject to [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration).

## Guided fictional tests

The test panel’s **Scenarios** tab contains 15 scripted cases with fake caller details, expected sources and manual checks. Preparing a scenario sets the transfer outcome and drafts a line; it never starts paid requests automatically. See [testing the coworking front desk](docs/testing.md) for the reference facts and repeatable procedure.

## Validation and limits

Backend tests exercise concurrency, stale-result rejection, confirmation invalidation, retrieval, mock actions, provider transport contracts and WebSocket handling. Browser protocol tests check framed PCM, epochs and safe export. Controlled transports do not establish that a live model or speech account works.

Interrupted voice history retains provider-aligned spoken text when available; otherwise it records an unknown prefix with an interruption marker, never an invented heard suffix.

Bounded real-model workflow and real speech-protocol checks have passed; acoustic latency percentiles are not established. The target is 1.0–1.2 seconds from acoustic end to meaningful playback, flagging turns above 1.5 seconds. Exports now include per-turn retrieval duration, first server audio, browser audio arrival, and first rendered playback. Estimated TTFS uses the last microphone-activity timestamp and estimated output presentation; it is not a physical acoustic measurement. Endpoint-to-audio/playback are reported separately. Greetings, runtime readbacks and tool-result follow-ups are excluded from ordinary-reply TTFS summaries. Model/voice defaults are candidates, not measured winners. Record warm/cold and tool paths separately before publishing performance claims; see the [evidence checklist](docs/evidence.md).

Deferred: multilingual support, real telephony, durable delivery, vector retrieval, speculative TTS, distributed abuse controls, deployment-wide metering and a visual node editor.

## Repeatable evaluation

`uv run libretto evaluate` checks eight curated Northline retrieval cases locally without API calls and writes a detailed JSON report under ignored `.local/evaluations/`. `uv run libretto evaluate --live` explicitly opts into bounded paid OpenRouter calls for the accepted-message/corrected-contact/capture and unavailable-transfer paths. It uses fictional callers, real speaker/evaluator requests and simulated business tools; it does not benchmark microphone or TTS latency. Use `--output PATH` to retain separate runs. The evaluation cases are specific to the bundled demo.

The State tab displays mean/median estimated TTFS and confirmed-turn retrieval duration. Export session retains the per-response records, sample counts, measurement references and separate timing for non-reply speech. These are session-memory measurements, not server-side analytics or durable recordings. BM25 here scans a small local corpus; its sub-millisecond local timings do not establish large-corpus or hosted performance.
