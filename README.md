# Libretto

**Voice workflows, written in YAML.**

[![CI](https://github.com/Prasad-178/libretto/actions/workflows/ci.yml/badge.svg)](https://github.com/Prasad-178/libretto/actions/workflows/ci.yml)

[Live demo](https://libretto.prasadjs.me) · [Architecture](docs/architecture.md) · [Testing guide](docs/testing.md) · [LiveKit voice](docs/livekit.md) · [Speech adapters](docs/speech-providers.md) · [Access and security](docs/security.md)

[Python library guide](docs/library.md) · [Policy migration](docs/migrations/request-policies.md) · [Product direction](docs/product-direction.md) · [Roadmap](ROADMAP.md)

Libretto is an OSS developer tool. Studio is its visual editor and testing/debugging companion. Accounts, billing, collaboration and a managed hosted product are outside the product direction. The reusable-core branch adds an importable runner proven by Northline and a repair-visit workflow; LiveKit is now the default voice engine; live-provider acceptance remains a separate verification gate. See the roadmap for verification and release status.

Libretto is a Python workflow engine and React studio for building stateful voice agents. Define stages, prompts, fields, transitions, knowledge and actions in YAML; inspect the generated workflow; then test it over voice or text while watching state, sources and tool receipts.

The bundled agent is Jamie, the receptionist at **Northline Workspace**, a fictional coworking space. Ask about memberships or rooms, request a transfer, or leave a message after a simulated failed transfer. Transfers and message captures are session-only simulations; they do not contact anyone or create a real ticket.

The runtime constrains transitions and action prerequisites. Language understanding and generated wording remain probabilistic: a YAML graph does not make an LLM deterministic.

## Watch the walkthrough

https://github.com/user-attachments/assets/ec26fe2c-e9d9-43fe-9f11-a10119b37756

A 3 minute 40 second walkthrough of the workflow, YAML and agent settings.

## Try it

Open the **[studio](https://libretto.prasadjs.me/studio)**. Browse Flow, Routes, YAML, Settings and Sources without connecting to a provider.

To start a conversation, open **Connection settings** and enter your own keys:

| Mode | Required keys |
| --- | --- |
| Text | OpenRouter |
| Voice (default) | OpenRouter plus LiveKit Cloud API key and secret for AssemblyAI STT / Cartesia TTS through LiveKit Inference |

API usage is billed by those providers. LiveKit Inference speech usage is billed by LiveKit; the existing LLM adapter uses OpenRouter billing. Direct provider keys and explicit legacy Deepgram remain options. The public demo has no funded shared provider keys. Keys stay in tab/session memory, are sent to the backend over HTTPS/WSS, and are excluded from browser storage and app-generated exports. See the [credential boundaries](docs/security.md).

A few natural things to try:

- “What membership options do you have?” Then: “What about meeting rooms?”
- “Can I speak to Maya in billing?” Approve the destination and observe the simulated transfer result.
- “I'd like to leave a message.” Supply invented details, correct the callback number, and confirm the new readback.
- Ask about an unpublished discount or try to book a room. The agent should explain its limits without inventing a policy or claiming a booking.

The test panel includes **15 scenarios** with fictional data, expected sources and selectable transfer outcomes. Use **State**, **Sources** and **Trace** to inspect what happened. Calls end after five minutes; a new call starts fresh. Prefer headphones when evaluating interruptions.

## Use the Python core

Register application tools in Python, compile your YAML with `compile_workflow`, and run it with `WorkflowRunner` and your responder/evaluator adapters. Core installation needs no web server or Studio. See the [library guide](docs/library.md) for source installation, public imports, lifecycle/delivery rules and application composition; compare the [repair example](examples/repair_visit/agent.yaml) with Northline. The repository license must still be selected before a reusable release.

## What is implemented

- **Visual workflow editing and YAML.** Select a step to edit its prompt, name, readback or action settings in the right panel. Select a transition to edit its destination, language condition and state checks; use + to insert a conversation, fixed message or registered action. Graph edits and YAML share one definition, with Undo and YAML export. Validate checks the draft; each test runs an immutable snapshot. A sanitized local draft can be restored in this browser; export downloads a copy and never overwrites your original file.
- **Concurrent speaking and evaluation.** A streaming speaker produces the reply while a separate structured evaluator proposes facts and routing. Ordinary speech has no preceding LLM classifier.
- **Runtime-owned state and actions.** Typed fields, allowed graph edges, confirmation checks and session-local action deduplication constrain execution. Corrections invalidate previous confirmations.
- **Streaming audio and interruption handling.** Browser AudioWorklets capture/play PCM. Work epochs reject stale output; playback acknowledgements distinguish generated speech from delivered speech.
- **Document retrieval.** Local BM25 retrieves relevant Markdown passages, including context for short follow-ups. Sources are visible in the test panel.
- **Voice-call controls.** A lightweight CSS orb reflects call state, with a spoken welcome, mute/end controls and responsive layouts.
- **Diagnostics and evaluations.** Session exports include stage/fact/tool events, retrieval duration and estimated audio/playback latency. Local checks and opt-in real-model evaluations are separate.

## Run locally

Requires **Python 3.12+**, [uv](https://docs.astral.sh/uv/) and **Node.js 22.12+** (24 recommended).

```sh
git clone https://github.com/Prasad-178/libretto.git
cd libretto
uv sync --locked
npm --prefix web ci
npm --prefix web run build
uv run libretto serve
```

Open **http://127.0.0.1:8000** and enter keys in Connection settings. Alternatively, copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` and `DEEPGRAM_API_KEY` there. Never put provider credentials in YAML or `VITE_` environment variables.

For frontend development, keep the backend running and start:

```sh
npm --prefix web run dev
```

Vite proxies `/api` and its WebSocket to port 8000. A frontend build is required when serving the compiled studio directly from the Python server.

## Studio files and local sources

Studio is available at `/studio`. Open a YAML file to edit its prompts, routes and fields. The complete Routes index keeps return paths and routes hidden by a saved view discoverable. The editor supports desktop windows at least 1024px wide.

**Open** reads your selected files. **Export YAML** downloads the current definition under its original filename; it does not write back to disk. Optionally download `<name>.studio.json` alongside `<name>.yaml` for presentation hints and named views. Open both files together to restore them. YAML remains the runtime definition: the sidecar is never required to run it. Invalid drafts can be exported explicitly; testing requires validation and freezes the selected revision until Stop.

To inspect your own Markdown knowledge, run a local project:

```sh
uv run libretto serve /absolute/path/to/project/agent.yaml --project-root /absolute/path/to/project
```

Open that runtime's `http://127.0.0.1:8000/studio`. Source paths are relative to the explicit project root and cannot escape it. **Sources → Add collection** lists existing Markdown folders; attaching or detaching changes YAML references, not the source files. Retrieval preview uses the runtime's BM25 index and exposes ranked passages, normalized terms and content hashes. Missing folders are reported rather than fabricated.

Bare `libretto serve` and the hosted demo use bundled sources only. They cannot browse arbitrary local folders; selecting a YAML file in the browser does not grant filesystem access to its neighboring files. Connection settings target the same runtime that serves Studio. Provider keys stay in memory, outside YAML, sidecars and persisted drafts.

Generic example graphs are in `web/src/studio/fixtures/`, including intake, branching, shared destinations and cycles. Studio supports generic graph editing; the bundled runtime still includes receptionist-specific confirmation safeguards. This work does not ship a stable importable library API or a LiveKit adapter.

## A workflow is a file

This complete example is [examples/minimal.yaml](examples/minimal.yaml):

```yaml
version: 1
id: tiny-survey
name: A one-question survey
start: question
shared_prompt: Speak English. Ask one question at a time.
fields:
  answer: {type: string, description: The user's answer}
nodes:
  question:
    kind: conversation
    title: One question
    prompt: Ask what makes a useful demo. Thank the caller when answered.
    edges:
      - {id: answered, to: end, condition: The user answered or declined the question.}
  end: {kind: end, title: Finished}
```

Validate or inspect a definition without a provider call:

```sh
uv run libretto validate examples/minimal.yaml
uv run libretto graph examples/receptionist.yaml
```

The [receptionist definition](examples/receptionist.yaml) adds shared and stage-specific prompts, typed facts, knowledge sources, conversation/action nodes, readback templates and speech settings. The [architecture guide](docs/architecture.md) explains scheduling, transition commits and action execution.

## How a voice turn works

```mermaid
flowchart LR
    Mic[Browser microphone] --> STT[Speech recognition and turn detection]
    STT --> Runtime[Session runtime and local retrieval]
    Runtime --> Speaker[Streaming speaker]
    Runtime --> Evaluator[Structured evaluator]
    Speaker --> TTS[Streaming synthesis]
    TTS --> Playback[Browser playback]
    Evaluator --> Controller[Validate facts and permitted transitions]
    Controller --> State[Stage and guarded actions]
    Playback -->|Delivery acknowledgements| State
```

The speaker and evaluator receive a fixed stage snapshot. A valid pending transition commits at a generation boundary; it does not change a reply's prompt midway through streaming. Actions require authoritative facts and confirmation, and voice actions wait for playback. A runtime-generated welcome and validated readback need no speaker request.

Libretto owns the orchestration. OpenRouter supplies the current LLM API; Deepgram supplies recognition, turn detection and synthesis. Flux TTS accepts raw text deltas and chooses synthesis boundaries inside the provider. There is no local sentence-completion model or per-word synthesis request.

Recognition and synthesis have separate adapter contracts. **Deepgram is the only shipped speech provider today**; another provider requires an implemented and registered adapter, not just a new YAML name. See [speech provider integration](docs/speech-providers.md).

## Verify and evaluate

```sh
uv run pytest -q
uv run ruff check src tests app.py
uv run libretto evaluate
npm --prefix web test
npm --prefix web run build
```

[GitHub Actions](https://github.com/Prasad-178/libretto/actions/workflows/ci.yml) runs those checks on pushes and pull requests with no provider keys or paid API calls. The suite covers concurrency, stale work, confirmation/readback guards, tool receipts, access limits, provider contracts, audio ordering and timing calculations.

`libretto evaluate` runs eight curated Northline retrieval checks offline and writes a report under ignored `.local/evaluations/`. The explicitly opted-in command below makes **paid OpenRouter requests** for two fictional workflows: message/corrected-contact/capture and unavailable transfer.

```sh
uv run libretto evaluate --live
```

Those cases use real model calls and simulated business tools. They do not measure microphone or TTS latency. Use `--output PATH` to retain separate reports. See the [testing guide](docs/testing.md) and [verification evidence](docs/evidence.md).

The State tab and session export report mean/median retrieval time and estimated time to first speech. Browser measurements separate confirmed-endpoint-to-audio/playback from microphone-activity-to-playback estimates. Greetings, readbacks and tool-result follow-ups are excluded from ordinary-reply summaries. **These are diagnostics, not a controlled acoustic latency benchmark.**

## Deployment and limits

The current demo runs on Vercel at **https://libretto.prasadjs.me**. `app.py` is the FastAPI entrypoint; `vercel.json` builds the frontend and allows a 300-second function lifetime. One WebSocket owns one in-memory session. There is no database or reconnect recovery; setup time can make the hosting limit end a call slightly before the five-minute timer.

Vercel deployments default to visitor keys, even if provider keys are accidentally present in the environment. A shared budget requires explicit operator opt-in with `LIBRETTO_ALLOW_HOSTED_KEYS=true`. Provider usage is billed separately from hosting, and platform included limits still apply. See [security and public-traffic limits](docs/security.md).

Current scope:

- English only; browser voice and text, with no telephony.
- A small bundled Markdown corpus with lexical retrieval; no embeddings, vector database or large-corpus scalability claim.
- Simulated transfers and message capture; no durable business delivery, account access, payments or bookings.
- No freeform node dragging, distributed application rate limiter or deployment-wide spending meter. Protected before-action connections do not offer step insertion; reconnect to an existing end step to finish a branch.
- Workflow and session exports are explicit downloads. They can contain conversation details; review them before sharing.

## Find your way around

| Path | Responsibility |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Pipeline, state model, scheduling and extension boundaries |
| [src/libretto/runtime.py](src/libretto/runtime.py) | Session state, concurrent work, transitions, readbacks and action guards |
| [src/libretto/schema.py](src/libretto/schema.py) | Validated YAML schema and graph references |
| [src/libretto/speech.py](src/libretto/speech.py) | Provider-neutral speech coordination and registration |
| [src/libretto/providers](src/libretto/providers) | OpenRouter and Deepgram adapters |
| [src/libretto/retrieval.py](src/libretto/retrieval.py) | Local Markdown indexing and lexical retrieval |
| [web/src](web/src) | React studio, workflow canvas, browser audio and timing |
| [examples](examples) | Fictional receptionist, minimal workflow, knowledge and scenarios |
| [docs/testing.md](docs/testing.md) | Test paths and expected demo behavior |
