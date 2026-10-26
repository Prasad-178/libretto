# Independent speech providers

Split the existing speech transport without changing workflow scheduling or adding model requests.

- Define independent STT/TTS protocols, normalized events and explicit capability records.
- Move runtime calls and browser audio framing into a provider-neutral coordinator.
- Keep Deepgram protocol parsing, connection recovery and aligned interruption inside separate adapters.
- Select adapters/models/hints through strict YAML configuration and an allowlisted server registry. No arbitrary provider URLs or imports.
- Preserve current PCM formats (16 kHz input, 24 kHz output), speculative confirmation gating, patient profiles, cancellation barriers, three-minute limits and credential cleanup.
- Prove mixed providers and capability fallbacks with independent in-process test adapters. Only Deepgram ships as a real speech implementation in this change.

Baseline: 57 backend tests pass. Verify new contracts before implementation, then rerun backend tests, lint, frontend tests and build. Commit coherent milestones and deploy the verified batch. Live API latency remains unverified without credentials.
