# LiveKit Default Voice Migration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task, directly on main. Keep regular commits. Steps use checkbox syntax.

**Goal:** Make LiveKit the default library/Studio voice integration, with AssemblyAI STT and Cartesia TTS through LiveKit Inference for the convenient setup, and optional direct provider plugins/Deepgram.

**Architecture:** Libretto's existing WorkflowRunner owns facts, graph transitions, confirmation and actions. LiveKit Agents owns media and turn handling. The integration must produce exactly one Libretto response per committed turn. Provider selection and credential routing are separate from workflow authority.

**Tech Stack:** Python 3.12+, LiveKit Agents 1.8.10 (feasibility pin from PyPI on 2026-11-04), existing React Studio and deterministic runtime tests.

**Spec:** Approved migration outline in this thread; ROADMAP.md M2; AGENTS.md product constraints; existing M1 public API and delivery contracts. This plan records the approved outline; detailed adapter signatures follow the feasibility result.

## Global constraints

- Work directly on main; preserve unrelated untracked design/review files.
- OSS developer tool only. No Libretto accounts, billing, collaboration or managed runtime.
- Core/text usage must work without LiveKit. Self-hosted LiveKit and direct provider credentials remain supported; Cloud Inference is a convenience, not a core requirement.
- LiveKit Inference requires LiveKit Cloud API key/secret; room connectivity also uses the project URL. Direct plugins need their own provider credentials.
- Keep OpenRouter for the existing speaker/evaluator initially; do not claim one LiveKit credential covers that existing adapter. A LiveKit-backed language adapter would need its own structured-evaluation proof.
- Credentials stay server-side/in ephemeral session configuration, never executable YAML, drafts, sidecars, traces, exports or browser-delivered room credentials. Browser joins use scoped short-lived room tokens.
- No paid inference during automated checks. Real voice checks require deliberate credential setup and opt-in usage.
- Preserve M1 request, interruption, delivered-readback, unknown-action and stale-callback guarantees.
- No implicit fallback to Deepgram or another credential mode when configuration fails.

### Task 1: Credential and delivery feasibility decision

Files: `docs/milestones/2026-11-04-livekit-feasibility.md`; ignored `.local/livekit-spike/`.

- [x] Verify Cloud Inference versus direct-plugin credentials in official documentation; confirm AssemblyAI and Cartesia availability.
- [x] Install SDK 1.8.10 in an isolated ignored environment; leave core project dependencies unchanged during inspection.
- [x] Prove finalized input, disabled automatic replies, streaming speech, interruption and shutdown with an SDK-level harness; no credentials or paid requests.
- [x] Trace output completion to its source. SDK queue drain alone must not be promoted to verified browser rendering. Select an explicit delivery capability/acknowledgement design before approving guarded action support.
- [x] Commit a feasibility decision recording evidence, supported mode and unresolved capabilities. Do not silently weaken the readback rule to claim success.

### Task 2: Provider and integration configuration

Files: schema/config modules, optional LiveKit integration package, pyproject.toml/uv.lock, compiler and credential tests.

- [ ] Write failing tests distinguishing LiveKit Inference and direct-plugin configurations, required credentials, unsupported providers, legacy Deepgram configuration and core import isolation.
- [ ] Add an explicit typed integration config and provider factories with allowlisted SDK construction. Keep endpoints/credentials in application configuration and avoid arbitrary YAML imports.
- [ ] Default the documented voice setup to LiveKit with AssemblyAI/Cartesia Inference. Keep Deepgram selectable through explicit configuration.
- [ ] Run schema/compiler/credential/install tests and commit.

### Task 3: Runner adapter and executable repair example

Files: `src/libretto/integrations/livekit/`, `examples/livekit_repair/`, integration tests.

- [ ] Add failing tests for duplicate/interim/final turns, exactly one response, message/request/epoch identity, wrong/partial/stale delivery, repeat after interruption and cancellation-resistant callbacks.
- [ ] Implement the SDK adapter around WorkflowRunner, using Task1's proved delivery capability. Explicitly reject unsupported guarded delivery rather than auto-acknowledging generation or enqueue.
- [ ] Add a runnable example with fictional booking handler, env variable names only, configurable model IDs/voice, lifecycle cleanup and actionable missing-credential errors.
- [ ] Run deterministic adapter/public API tests and commit.

### Task 4: Studio default voice migration

Files: existing server and browser connection/audio/session modules, backend API and browser tests.

- [ ] Add API/browser tests for the LiveKit default, custom-IO playback acknowledgement, missing settings, stop/reconnect, private credential exclusion and explicit legacy behavior. Studio retains PCM/WebSocket transport through LiveKit custom IO; room-token exchange is only needed by room-based consuming applications.
- [ ] Connect Studio to the same adapter/runner without a second workflow engine. Replace Deepgram-specific connection assumptions and show integration versus speech-provider configuration clearly.
- [ ] Keep text mode usable without LiveKit. Preserve source edits, export and test snapshot behavior.
- [ ] Inspect actual rendered Studio states and run affected browser tests before committing.

### Task 5: Compatibility, documentation and acceptance

Files: README, docs/library.md, docs/livekit.md, migration notes, ROADMAP, CI as needed.

- [ ] Run Ruff, all backend tests, clean core installation, retrieval checks, frontend tests/build and full browser suite without paid providers.
- [ ] Document LiveKit Cloud URL/key/secret, direct-plugin credentials, OpenRouter's separate role, inference usage billing, server/browser credential separation and self-hosted setup.
- [ ] Deliberately run a live AssemblyAI/Cartesia repair scenario only once credentials and paid-use permission are available. Record separately from deterministic checks.
- [ ] Verify interruption before approval cannot book; fresh complete readback plus later approval can book. Report exact tested transport/SDK/provider configuration.
- [ ] Review the whole change and fix important findings; commit regular, reviewable increments. Check CI at the final pushed head before claiming completion.
