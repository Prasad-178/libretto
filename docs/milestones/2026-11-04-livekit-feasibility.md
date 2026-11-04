# LiveKit migration feasibility — in progress

The default migration and AssemblyAI/Cartesia example are approved. Full implementation and live acceptance are not complete.

## Credential findings

Official LiveKit Inference documentation states that `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` authenticate requests without separate model-provider API keys. Its model catalog includes AssemblyAI STT and Cartesia TTS. A LiveKit Cloud project URL is also needed for room connectivity. Inference usage is billed through LiveKit; credentials are not free/unlimited inference.

Direct provider plugins instead use each provider's own credentials. Self-hosting a LiveKit media server does not issue credentials for LiveKit Cloud Inference. Keep this direct route available alongside the convenient Cloud route.

The current Libretto speaker and evaluator use OpenRouter. That credential remains separate unless a new language adapter is explicitly implemented and verified; the speech migration alone cannot remove it.

Source: https://docs.livekit.io/agents/models/inference/ and https://docs.livekit.io/agents/models/ (checked 2026-11-04).

## SDK inspection

Installed `livekit-agents==1.8.10` in ignored `.local/livekit-spike/venv`; no dependency changes to the core package and no network inference calls.

The standard room audio output waits for its `rtc.AudioSource.wait_for_playout()` before emitting `PlaybackFinishedEvent`. This establishes source queue completion; it must not automatically be presented as a browser-rendering acknowledgement. Next, the feasibility harness must select and prove the output-delivery capability appropriate to the supported transport. Guarded actions remain subject to M1 delivery rules.

Relevant SDK source: `livekit/agents/voice/room_io/_output.py` and `livekit/agents/voice/io.py` in the pinned distribution. Agent hooks include `on_user_turn_completed` and `llm_node`; disabling duplicate automatic generation still needs a working harness, not just signature inspection.
