# LiveKit migration feasibility decision

The default migration and AssemblyAI/Cartesia example are approved. The SDK-level lifecycle probe passes; production integration and live acceptance remain pending.

## Credential findings

Official LiveKit Inference documentation states that `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` authenticate requests without separate model-provider API keys. Its model catalog includes AssemblyAI STT and Cartesia TTS. A LiveKit Cloud project URL is also needed for room connectivity. Inference usage is billed through LiveKit; credentials are not free/unlimited inference.

Direct provider plugins instead use each provider's own credentials. Self-hosting a LiveKit media server does not issue credentials for LiveKit Cloud Inference. Keep this direct route available alongside the convenient Cloud route.

The current Libretto speaker and evaluator use OpenRouter. That credential remains separate unless a new language adapter is explicitly implemented and verified; the speech migration alone cannot remove it.

Source: https://docs.livekit.io/agents/models/inference/ and https://docs.livekit.io/agents/models/ (checked 2026-11-04).

## SDK inspection

Installed `livekit-agents==1.8.10` in ignored `.local/livekit-spike/venv`; no dependency changes to the core package and no network inference calls.

The standard room audio output waits for its `rtc.AudioSource.wait_for_playout()` before emitting `PlaybackFinishedEvent`. This establishes source queue completion; it must not automatically be presented as a browser-rendering acknowledgement. Next, the feasibility harness must select and prove the output-delivery capability appropriate to the supported transport. Guarded actions remain subject to M1 delivery rules.

Relevant SDK source: `livekit/agents/voice/room_io/_output.py` and `livekit/agents/voice/io.py` in the pinned distribution. Agent hooks include `on_user_turn_completed` and `llm_node`; disabling duplicate automatic generation still needs a working harness, not just signature inspection.

## Decision: verified custom output for Studio

Use LiveKit AgentSession with custom AudioInput/AudioOutput for Studio's existing PCM/WebSocket connection. LiveKit handles the speech/turn pipeline; Libretto owns the single workflow session. Studio continues to acknowledge actual browser-rendered audio by speech/message/epoch identity. The SDK output emits its playback-finished event only after that acknowledgement; flush/enqueue never grants authority.

This deliberately does not migrate Studio to WebRTC rooms. There is no Studio room-token exchange and its custom-IO setup needs Cloud Inference key/secret, not a room URL. A developer's separate room application needs the room URL and scoped room credentials, and must supply verified output completion for guarded actions. Default room-source drain alone is insufficient under M1's stronger delivery contract.

Reproduction: `.local/livekit-spike/venv/bin/python tests/support/livekit_probe.py` with livekit-agents1.8.10. The probe uses real SDK AgentSession, an AudioInput, synthetic STT/TTS nodes, and an AudioOutput requiring explicit ack. It proves finalized input, StopResponse preventing duplicate LLM replies, incremental text synthesis, output flush still pending, acknowledgement completing speech, interruption and clean shutdown without paid/network inference.
