# LiveKit default migration verification

Implementation on main, based on `1e8a0e8`. Independent final review of `1e8a0e8..84c9a41` and the single regression-driven fix pass are complete locally. No deployment, remote CI success or live-provider acceptance is claimed.

## Implemented evidence

- `2f468ed`: real SDK1.8.10 probe, custom verified output, suppressed automatic replies, streaming synthesis and interruption.
- `5b8b0f5`: separate integration/provider/credential configuration and optional SDK/plugin dependencies. Legacy Flux remains explicitly recognized; core-only install still works.
- `e5167cf`: SDK adapter around one existing workflow session; repair example; speech-start cancellation and own-message-only stale interruption handling.
- `1ccb880`: default Northline/Studio migration; LiveKit key/secret fields; optional direct provider fields; model/engine settings; matching playback delegation; updated compatibility tests.

Local checks: Ruff, backend240, frontend117, browser27, production build and retrieval8 pass. The backend suite includes a clean core wheel install/run outside the checkout without FastAPI/LiveKit, and real SDK synthetic audio/turn/delivery tests. Studio connection/model screenshots were inspected. New credentials are not persisted into drafts/YAML or exposed in config/session exports. Tests use fake/synthetic providers; no paid inference was performed.

## Final review and fixes

The independent reviewer confirmed one Critical and three Important findings. Each had a reproducing failing test before its fix:

- Partial synthesis failure now revokes delivery eligibility and resolves SDK playback as interrupted. A real default SDK TTS node emits 10 ms of audio, then fails; acknowledging that partial output cannot deliver the full runtime readback.
- Binding abort signals release blocked text/EOF producers. Tests exercise a full queue behind unacknowledged welcome, interruption and close; interrupted connections can synthesize and acknowledge a fresh reply.
- Voice rejects a text-mode runner or a session without external delivery before opening providers, preventing text event iteration from granting voice confirmation.
- Abbreviated legacy Flux YAML uses the same omitted-provider defaults in Studio and Python, so the Deepgram credential field remains available.

Deferred minor: Studio recognition hints/patient controls remain editable although LiveKit does not apply them. The adapter limitation is documented; inline inactive-setting guidance remains future polish. No additional review round was requested.

## Explicit design decisions

Studio retains its existing PCM/WebSocket transport through LiveKit custom AudioInput/AudioOutput. LiveKit AgentSession is the voice engine; it handles speech/turn orchestration, while Libretto remains the only workflow authority. Keeping the browser worklet preserves actual rendered-output acknowledgement. No WebRTC-room rewrite or room-token endpoint is needed for this default path.

Room applications need their own room URL/tokens and verified output capability. Standard room-source queue drain alone cannot authorize M1's guarded actions. This migration does not claim a room adapter with that capability.

Cloud Inference is the convenient default speech credential route, not a mandatory dependency of the core. Direct plugins and native legacy Deepgram remain available. The existing LLM adapter still uses OpenRouter independently.

## Remaining acceptance gates

Live AssemblyAI/Cartesia recognition, synthesis, acoustic quality and service authentication require a deliberate developer-owned-credential session. SDK constructor/synthetic tests do not establish them. No live-provider acceptance is claimed. Remote CI must be checked at the final pushed head. License selection and release remain owner gates.
