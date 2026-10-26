# Speech provider integration

The workflow runtime imports no speech vendor. `SpeechCoordinator` connects normalized recognition/synthesis events to runtime turns, interruption reconciliation and browser audio framing. The WebSocket server selects independent adapters through `SpeechRegistry`.

```yaml
speech:
  stt: {provider: deepgram, model: flux-general-en}
  tts: {provider: deepgram, model: flux-haley-en}
  hints: [Northline, Jamie, billing]
```

Omitting this section retains those provider/model defaults, with no domain hints. The receptionist example supplies its own English recognition hints. Provider/model names are validated against the server registry. YAML cannot choose a host, load Python or register a new provider. The shipped Deepgram adapters currently allow only the two models above; supporting another model requires checking its protocol/capabilities and updating its adapter allowlist.

## Contracts

`providers/base.py` defines separate `STTProvider` and `TTSProvider` protocols, event records and capabilities. Factories receive `(credentials, endpoint_config, event_sink, *, hints)` and must not perform network work until `open()`. Each adapter owns its connections/tasks and must release them in an idempotent `close()`.

The audio boundary is mono signed PCM16: recognition input at 16 kHz and synthesis output at 24 kHz. An adapter for another native format must convert it. TTS `playback_ms` is the browser's cumulative played-audio clock; `open(playback_ms=...)` establishes the provider connection's baseline. Credential replacement creates fresh adapters without resetting this clock or the call limit.

STT emits `started`, `resumed`, `eager`, `final`, or `status` events. Stable turn IDs let an eager candidate match the confirmed transcript. The coordinator alone calls runtime `interrupt`, `submit_turn` and `confirm_turn`. Eager output remains gated until confirmed by the runtime. Providers must emit speech-start/resume events for caller interruption.

TTS consumes raw text deltas and a response boundary. It emits `started` with the runtime epoch/message ID and an opaque speech ID, `audio` with that epoch/speech ID, `finished`, and `interrupted` with the affected speech/message ID. Preserve these identifiers and event order across chunks. The coordinator frames PCM for the browser and binds speech to history; browser drain acknowledgements establish full delivery.

Cancellation must discard old audio and establish a safe boundary before new speech. The Deepgram adapter retains its acknowledgement barrier, spoken-prefix alignment and connection replacement when interruption cannot be acknowledged. No extra model request or sentence classifier is introduced.

## Capabilities and fallbacks

- STT without `eager_turns` starts generation only on confirmed turns. Eager events from such an adapter are ignored.
- `patient_profiles` and `force_end` are optional. Unsupported operations are not sent to the provider.
- Live TTS requires `streaming_text` and `cancellation`. An adapter lacking either is rejected instead of silently degrading voice behavior.
- Without `spoken_prefix`, interrupted output is reconciled with an empty known prefix. Generated text is not treated as heard text. Fully drained speech still counts as delivered.
- The coordinator publishes `speech_capabilities` on connection, available in the trace.

## Adding an adapter

Implement only the appropriate STT or TTS protocol, translate that service's events, declare truthful capabilities and register its factory in the corresponding `SpeechRegistry` allowlist. Supply the registry to `create_app(speech_registry=...)`; the default server registry is in `speech.py`. A mixed pair requires no changes to workflow/state/RAG/tool code.

`SessionCredentials` and the browser currently expose OpenRouter and Deepgram key slots. An adapter using either can reuse it; a service with a new credential type also needs a credential/input binding in those application settings. Provider keys remain outside YAML, traces and exports. Hosts remain fixed inside adapters.

Only Deepgram is a shipped speech provider today. Test adapters prove mixed selection, WebSocket streaming, capability fallback and credential replacement; they are not offered as a live fallback or a claim of real-provider interoperability. No live latency measurement has been made without speech/model credentials.
