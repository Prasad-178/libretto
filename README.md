# Libretto

Voice workflows, written in YAML.

An English voice-agent prototype with a Python workflow engine and a React demo. Jamie, receptionist at the fictional Northline Studio, answers document-backed questions, finds departments, confirms simulated transfers, recovers by taking a message, and wraps up.

The runtime enforces graph transitions, typed state, stage-scoped capabilities and action prerequisites. Models interpret the caller and generate speech; their interpretation and wording are probabilistic. A YAML graph does not make an LLM deterministic.

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
uv run libretto validate examples/minimal.yaml
uv run pytest -q
uv run ruff check src tests app.py
npm --prefix web test
npm --prefix web run build
```

## How it works

- `examples/receptionist.yaml` defines the shared prompt, typed fields, models, knowledge, stages, permitted transitions and registered actions. `examples/minimal.yaml` is an unrelated two-stage example.
- Speaking and structured evaluation run concurrently. Each generation uses a fixed stage snapshot. Valid pending transitions commit at generation boundaries; action guards wait for authoritative prerequisites and confirmation.
- Local BM25 retrieval searches Markdown sections on every nonempty input, using recent context for follow-ups and filtering sources by the active configuration. There is no preceding FAQ classifier, query-rewrite LLM or vector database. Lexical search can miss paraphrases.
- Flux STT eager signals start draft generation; matching confirmed input releases speech. Resumed speech cancels stale work. Flux TTS receives raw text deltas followed by one end-of-response Flush. There is no client sentence-boundary model.
- Browser AudioWorklets capture 16 kHz PCM and progressively play 24 kHz PCM. Epochs reject stale audio after interruption. Listening profiles allow longer pauses while collecting contact details.
- Transfers and message captures are **simulations**. Receipts exist only in the current session. They do not contact a real person or create a durable ticket.

The UI is an agent workspace with synchronized prompt forms and an editable YAML source, a bundled knowledge base, and a voice/text test panel. Apply changes validates the definition; every test uses a fixed snapshot of that YAML. Changes stay in the tab; Export YAML downloads a file. Active/pending stage, facts, passages, trace, countdown and simulated outcomes are inspectable during tests.

## Sessions and credentials

One WebSocket owns one in-memory conversation, capped at 180 seconds. Disconnecting or reconnecting starts fresh. There is no database, cross-instance session lookup or durable message storage. An explicit downloaded trace contains conversation details and should be treated accordingly.

Visitor keys stay in tab memory and their backend session, over HTTPS/WSS when hosted. They are not placed in browser storage, URLs, traces or exports. Server keys stay on the backend. Provider credentials are independent; replacing an OpenRouter key does not replenish Deepgram credit. Changing keys does not restart the timer. Provider hosts are fixed in code.

For a funded public demo, use provider-side limits on dedicated low-budget keys. Session duration and in-process counters are not a global spending cap. With no server keys the site is BYOK. API usage is billed by the providers.

## Hosting

`app.py` is the FastAPI entrypoint. `vercel.json` builds the frontend and permits a 300-second function lifetime; the application ends calls at 180 seconds. State stays within the one connection. Vercel Hobby is the intended hosting plan, subject to included limits. No paid hosting add-on or database is provisioned.

```sh
vercel deploy
```

Initial deployment: https://libretto-khaki.vercel.app. The Vercel project also has `libretto.prasadjs.me` attached; DNS is pending. At Cloudflare add a DNS-only CNAME named `libretto` targeting `4df64d3f7d5dc4a6.vercel-dns-017.com` (proxy disabled). Do not change the domain nameservers or other records. Local research, credentials and session data are excluded by `.gitignore` and `.vercelignore`.

Vercel documents [FastAPI frontend builds and WebSockets](https://vercel.com/docs/frameworks/backend/fastapi); connections remain subject to [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration).

## Validation and limits

Backend tests exercise concurrency, stale-result rejection, confirmation invalidation, retrieval, mock actions, provider transport contracts and WebSocket handling. Browser protocol tests check framed PCM, epochs and safe export. Controlled transports do not establish that a live model or speech account works.

Interrupted voice history retains provider-aligned spoken text when available; otherwise it records an unknown prefix with an interruption marker, never an invented heard suffix.

**Live provider calls and acoustic latency are not yet validated.** The target is 1.0–1.2 seconds from acoustic end to meaningful playback, flagging turns above 1.5 seconds. The UI's RMS-based response gap is an estimate, not that benchmark. Model/voice defaults are candidates, not measured winners. Record warm/cold and tool paths separately before publishing performance claims; see the [evidence checklist](docs/evidence.md).

Deferred: multilingual support, real telephony, durable delivery, vector retrieval, speculative TTS, production abuse controls, deployment-wide metering and a visual node editor.
