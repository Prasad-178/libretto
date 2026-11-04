# Libretto project instructions

Read [the product direction](docs/product-direction.md) and [the roadmap](ROADMAP.md) before proposing significant features or architectural changes.

- Libretto is an OSS developer tool for defining, testing, and running voice-agent workflows in YAML.
- Studio is only the companion visual editor, visualization, testing, and debugging tool/site. The runtime must work without Studio.
- Never add product accounts, billing, subscriptions, organizations, collaboration, shared workspaces, or a managed-agent platform. These are excluded product categories, not a future backlog.
- A commercial/managed hosted product is not planned. The existing public demo is a demonstration/testing surface, not permission to build one.
- Developers own their application, runtime, tools, credentials, and deployment. Provider credentials do not enter YAML, sidecars, persisted drafts, traces, or exports.
- Distribution is through GitHub/source installs; do not publish to PyPI or another package registry without an explicit change of direction.
- YAML owns executable workflow semantics. Studio metadata may only affect presentation. Keep source-preserving edits and generic graph support.
- The next major milestone is two substantive agents using one reusable core, followed by one optional LiveKit integration. Follow the roadmap gates instead of expanding Studio indefinitely.
- Keep changes independent of employer/client projects and data. The global Burni Consulting access restriction still applies.
- Make regular meaningful commits. Verify behavior, including actual rendered evidence for UI changes. Do not claim deployed or CI-passing without checking that exact state.
- Work directly on `main` for this project; do not create feature branches or worktrees unless Prasad explicitly requests one. Keep regular meaningful commits and run applicable checks before pushing. (Owner preference, 2026-11-04.)
- M2 direction: make LiveKit the default voice integration for the library and Studio; Deepgram remains an optional STT/TTS choice. Keep the core usable without LiveKit, support provider selection and self-hosted LiveKit, and never require LiveKit Cloud/Inference for core use. This is the approved direction, not a claim that migration has shipped. (Owner instruction, 2026-11-04.)
