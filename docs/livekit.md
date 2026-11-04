# LiveKit voice integration

[Library API](library.md) · [Repair example](../examples/livekit_repair/README.md) · [Feasibility decision](milestones/2026-11-04-livekit-feasibility.md)

LiveKit Agents1.8.10 is the default voice engine. Libretto still owns the YAML workflow, facts, request/confirmation rules and actions. An SDK Agent forwards final turns into the existing Session and raises StopResponse; it does not generate independent LLM replies or execute workflow tools.

Studio uses LiveKit's custom AudioInput/AudioOutput over its existing PCM/WebSocket transport. This migration does **not** switch Studio to WebRTC rooms. Keeping the browser worklet preserves actual rendered-audio acknowledgements. SDK output flush, TTS completion and server audio-source drain never grant confirmation by themselves.

## Install and start

From the source checkout with Python3.12+, uv and Node:

```sh
uv sync --locked
npm --prefix web ci
npm --prefix web run build
uv run libretto serve
# Or the fictional repair example with application-registered tools:
uv run python -m examples.livekit_repair
```

Open `/studio`. Models & speech separates voice integration, credential route, speech recognition, synthesis and voice ID. The built Studio/examples are checkout resources, not part of a core wheel. For a consuming Python application, install the Git/source package with `[livekit]`; `[studio]` includes that extra and the web-server dependencies. Core/text imports and execution still need neither SDK nor Studio.

## Credentials and usage

Default speech configuration:

```yaml
speech:
  engine: livekit
  credential_mode: inference
  stt: {provider: assemblyai, model: universal-streaming}
  tts:
    provider: cartesia
    model: sonic-3
    voice: 9626c31c-bec5-4cca-baa8-f8ba9e84c8bc
```

Set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from your LiveKit Cloud project. LiveKit Inference supplies AssemblyAI/Cartesia without individual provider keys and bills the inference usage to that project. Existing Libretto response/evaluation models still use `OPENROUTER_API_KEY`; this migration does not route those LLM calls through LiveKit. Credentials are application configuration, never YAML.

For Studio's custom-IO mode, no room URL or room token is needed. If your own application joins a LiveKit room, configure `LIVEKIT_URL` and room-scoped tokens there. A self-hosted media server key is not a credential for LiveKit Cloud Inference. The media server and inference service are separate choices.

Enter visitor credentials in Connection settings or configure the repository `.env` for local development. Keys entered in Studio stay in tab/session memory and are transmitted only to the selected same-origin backend. They are excluded from browser storage, YAML/sidecars, session exports and public configuration. On public Vercel deployments hosted keys remain disabled by default unless an operator explicitly enables them. Server-side configuration must not use `VITE_`-prefixed secrets.

Official references, checked 2026-11-04: [Inference authentication/models](https://docs.livekit.io/agents/models/inference/), [provider plugins](https://docs.livekit.io/agents/models/), [speech output](https://docs.livekit.io/agents/multimodality/audio/).

## Direct providers and optional Deepgram

Use the same engine/workflow with `credential_mode: providers` to connect provider plugins directly. AssemblyAI uses `ASSEMBLYAI_API_KEY`, Cartesia uses `CARTESIA_API_KEY`; a Deepgram plugin uses `DEEPGRAM_API_KEY`. No LiveKit Cloud Inference credentials are required for this route. Direct plugins are installed with the LiveKit extra. The English AssemblyAI gateway name `universal-streaming` maps explicitly to plugin model `universal-streaming-english`; it does not silently select the plugin's newer default.

The current bounded model choices are AssemblyAI `universal-streaming` or Deepgram `nova-3` for recognition, and Cartesia `sonic-3` or Deepgram `aura-2` for output. For Deepgram through the inference gateway, the model is `deepgram/aura-2`; its plugin equivalent uses a voice-qualified model such as `aura-2-athena-en`. Optional Deepgram therefore works through either credential route. It is not selected as a fallback when another provider fails.

The pre-migration native transport is retained explicitly:

```yaml
speech:
  engine: direct
  credential_mode: providers
  stt: {provider: deepgram, model: flux-general-en}
  tts: {provider: deepgram, model: flux-haley-en}
```

Old YAML containing this known Flux model pair without engine/credential_mode is recognized as legacy. New workflows/defaults use LiveKit. Choose “Direct Deepgram (legacy)” in Settings to migrate back intentionally; selecting it changes the relevant configuration atomically and is undoable. Unsupported model/provider combinations fail validation, never execute arbitrary imports or choose network endpoints.

## Delivery and cancellation contract

Every output handle is bound to a Libretto message, speech ID and generation epoch. The AudioOutput sends 24kHz mono PCM16 to Studio. It emits `speech_finished` after synthesis flushes, then waits for the browser's matching playback acknowledgement. Only a valid current acknowledgement completes SDK output and the core delivery permit. Duplicate, stale, wrong-epoch and interrupted acknowledgements cannot authorize an action.

Speech start invalidates pending core generation before the final transcript. Final input waits for that invalidation, then enters Libretto once using a stable turn ID. Interrupted output never resumes an old generation automatically. Correction/repeat paths issue a fresh runtime readback; approval must follow on a later turn. Late interruption callbacks can invalidate only their own message's permit.

A custom room application must supply equivalent verified output completion. The standard room AudioSource queue drain is not a browser-rendering acknowledgement under M1's stronger contract. No room adapter claiming guarded-action support ships here. Do not replace this rule with “generated text” or an SDK completion event.

## Programmatic composition

Applications can construct `LiveKitCoordinator` from `libretto.integrations.livekit.coordinator` with `(speech_config, credentials, runner, send_audio, send_control)`. The runner must use external delivery mode. The coordinator accepts trusted application-supplied SDK model objects for custom provider composition; YAML cannot construct those objects. Its `models=` injection is also how deterministic SDK tests avoid network inference.

The application pumps runner `text_delta`/`response_done` events to `speak_text`/`finish_response`, sends captured PCM via `send_input`, and passes verified output completions to `playback_finished(speech_id, epoch=...)`. Stop/incoming interruption must cancel output as well as invalidate the runner. Close the coordinator and runner in `finally`; closing voice alone intentionally preserves core state for credential replacement. The local server/example shows that ownership wiring. A coordinator is single-use after close.

## Evidence and limits

Real SDK tests with synthetic STT/TTS nodes cover final input, suppressed automatic replies, explicit playback acknowledgement, wrong epoch, interruption, fresh-readback booking, duplicate final turns, speech-start invalidation, late interruption and shutdown. API/browser tests verify credential routing, explicit legacy behavior, settings, private exports/drafts and failed-start recovery. These tests make no paid provider calls.

Live AssemblyAI/Cartesia recognition, voice quality and acoustic latency are **not yet verified**; they require a deliberate run with developer-owned credentials and usage permission. SDK/plugin constructor tests establish configuration wiring, not successful service authentication. Recognition hints/patient profiles are not claimed by the LiveKit adapter in this slice; use its published speech_capabilities. Existing M1 session/action durability limits remain. No Libretto hosted product, account system or package-registry publication is introduced.
