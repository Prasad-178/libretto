# Independent speech providers

Split the existing speech transport without changing workflow scheduling or adding model requests.

- Define independent STT/TTS protocols, normalized events and explicit capability records.
- Move runtime calls and browser audio framing into a provider-neutral coordinator.
- Keep Deepgram protocol parsing, connection recovery and aligned interruption inside separate adapters.
- Select adapters/models/hints through strict YAML configuration and an allowlisted server registry. No arbitrary provider URLs or imports.
- Preserve current PCM formats (16 kHz input, 24 kHz output), speculative confirmation gating, patient profiles, cancellation barriers, three-minute limits and credential cleanup.
- Prove mixed providers and capability fallbacks with independent in-process test adapters. Only Deepgram ships as a real speech implementation in this change.

Baseline: 57 backend tests pass. Verify new contracts before implementation, then rerun backend tests, lint, frontend tests and build. Commit coherent milestones and deploy the verified batch. Live API latency remains unverified without credentials.

## Verified outcome

Implemented in `5fec2ba`, `851908a` and `404257c`. Recognition hints now belong to YAML rather than the Deepgram adapter. Credential replacement restores the active stage's patient endpointing profile and retains the cumulative playback baseline.

- 63 backend tests pass, including mixed-provider voice over a real test WebSocket, normalized PCM framing, capability fallbacks, independent credential requirements and replacement cleanup.
- 12 frontend tests pass; TypeScript/Vite production build and Ruff pass.
- Source and tracked-history scans found no excluded company identifier.
- Application head `404257c` deployed successfully as `dpl_898qhzxAM8nHqYkNe3BJPKCHKnG8`, aliased to https://libretto.prasadjs.me.
- Public homepage, referenced frontend assets, health, config and YAML routes return 200. Public YAML validation accepts the shipped definition and rejects an incompatible speech model. WSS returns the selected provider's missing-key error without an inference request.

Remaining external validation: real microphone/provider calls, acoustic interruption quality and measured end-of-turn-to-first-sound latency. Only Deepgram is implemented as a live speech service; independent test adapters establish the integration seam, not cross-provider latency or quality parity. Integration instructions are in `docs/speech-providers.md`.
