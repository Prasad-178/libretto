# Libretto roadmap

Updated 2026-11-04. Direction approved by Prasad; M1 is merged into main and locally verified; later milestones are planned. [Product charter](docs/product-direction.md) · [Core spec](docs/superpowers/specs/2026-11-04-reusable-core.md) · [First implementation plan](docs/superpowers/plans/2026-11-04-reusable-core.md).

> An open-source tool that lets developers define, test, and run voice-agent workflows in YAML, with Studio as the visual editor and debugger.

## What we are building toward

A developer installs from GitHub, loads their YAML, registers application tools, runs tests, connects LiveKit if needed, and optionally opens Studio to inspect the same workflow. No Libretto account or hosted runtime is required.

Accounts, billing, subscriptions, organizations, collaboration, shared workspaces, and a managed hosted product are excluded. Studio remains a visual editor and testing/debugging companion. These are product boundaries, not deferred feature ideas.

## Current baseline

| Area | Existing behavior | Remaining gap relevant to this roadmap |
| --- | --- | --- |
| Definition | Strict YAML schema, fields, graph, prompts, knowledge, actions, model/speech configuration | Explicit request/confirmation semantics and compiled application tool contracts are implemented on main. |
| Runtime | Parallel responder/evaluator, transitions, cancellation epochs, readbacks and simulated actions | Core authority is generic; Northline guidance and simulated handlers are explicit application configuration. |
| Studio | Flow/Routes, inspectors, source-preserving edits/history, import/export/sidecar, Sources/retrieval, Settings, fixed test snapshots | Bounded usability gaps remain; no new product-platform layer is needed. |
| Developer API | Python source package, provider protocols and an internal Session | WorkflowRunner and the developer registry are documented and clean-install tested; see the library guide. |
| LiveKit | No Libretto adapter shipped | Need one thin integration with explicit media/control ownership. |
| Testing | Unit/API/browser checks and local retrieval evaluation | UI scenarios mostly remain manual; need reusable executable workflow scenarios. |
| Distribution | Source checkout works; repository public | Core-only wheel install/run verified outside checkout. License and release decision remain; no registry publication. |

This baseline was checked against source on 2026-11-04. The Nov 1 improvement review predates fixes to workflow selection, reasoning settings, import/recovery and Studio; reproduce its remaining findings before treating them as current defects. M1 moves domain-specific confirmation rules and interpretation guidance into example configuration.

## Sequence and gates

| Milestone | Deliverable | Depends on | Exit gate |
| --- | --- | --- | --- |
| M1 — reusable core | Generic tool contracts, request/confirmation rules, public facade, two action workflows | Current source baseline | Both workflows use the same core; corrections/repeated requests/interruptions cannot reuse stale permission or receipts. Clean install works. |
| M2 — LiveKit vertical slice | Optional adapter and runnable repair-visit voice example | M1 plus delivery-hook feasibility proof | One utterance reaches one evaluator, produces one reply and one authorized action; interruption/close tests pass. |
| M3 — executable testing/debugging | Scenario runner, stable assertions, reproducibility envelope, blocked-state explanations | M1; M2 for media-specific tests | A developer changes YAML, runs scenarios locally, and can explain a blocked action without reading raw event JSON. |
| M4 — external adoption | Quickstart, versioned examples, compatibility/migration guide, observed trials | M1–M3 | Three outside developers run and modify a workflow; setup failures are fixed or explicitly documented. |
| M5 — usage-driven improvements | Narrow additions selected from actual developer problems | Adoption evidence | Every addition identifies an observed problem, measurable acceptance and ongoing maintenance cost. |

Milestone order is not a calendar estimate. Keep one active milestone and a small maintenance lane. Start external developer conversations during M1; do not wait until M4 to discover integration needs.

## M1 — two agents, one reusable core

M1 is merged into main. The whole-branch review, verified fix pass and [follow-up maintainability review](docs/milestones/2026-11-04-m1-follow-up-review.md) are complete locally. Check CI at the current head; license and release gates remain. See the [milestone evidence](docs/milestones/2026-11-04-reusable-core.md), [library API](docs/library.md) and [request-policy migration](docs/migrations/request-policies.md). M2 implementation and its independent review/fix pass are now complete locally; real-provider acceptance remains pending. See the [M2 evidence](docs/milestones/2026-11-04-livekit-default-migration.md).

### Scope

- Characterize repeated requests, punctuation-sensitive readbacks, corrections and cancellation with deterministic adapters.
- Extract application tools from the fixed demo registry. Compile parameter bindings/types, required facts and result branches before a session.
- Add explicit request-scoped state and confirmation policies; remove named receptionist field rules from core/provider code.
- Migrate Northline and add a repair-visit agent using a deterministic booking stub. Both remain fictional examples.
- Expose a minimal Python facade over the existing runtime, not a replacement engine. Use the same compiler/facade from CLI, Studio server and tests.
- Verify installation/import/text execution in a temporary environment outside the repository. Keep built Studio assets out of the core distribution contract unless packaged explicitly.

### Acceptance scenarios

1. Complete two separate requests in one session, including identical arguments. Each requires its own confirmation and gets its own action identity.
2. Correct a confirmed address/contact/time before execution. Old confirmation is invalid and a fresh readback is required.
3. Interrupt a readback. No action runs until the current readback is fully delivered and subsequently accepted.
4. A readback ending in a period, question mark, newline or localized punctuation follows the same explicit delivery rule.
5. Refuse/cancel a request, then start another. Old consent, pending transitions and action receipts do not authorize it.
6. Late evaluator/output events from another epoch/request are discarded.
7. Invalid tool arguments, unknown tool/result/policy, cross-request field references and absent result recovery fail before any side effect.
8. A timeout with uncertain external delivery produces an unknown outcome; Libretto never silently retries it.
9. Import and run the core without FastAPI, Vercel, Studio assets, LiveKit, or repository-relative example paths.

### Completion evidence

Link the M1 spec/plan, exact commits, deterministic scenario outputs, clean-install result and compatibility changes. Include explicit old-to-new Northline YAML migration notes. Do not claim all language interpretation or real-world action delivery is deterministic.

## M2 — LiveKit as the default voice integration

Direction updated by Prasad on 2026-11-04: LiveKit becomes the default voice integration, including Studio testing; Deepgram becomes an optional STT/TTS choice. This expands M2 from an additional adapter to a migration of the default voice path. The default integration is implemented with pinned SDK 1.8.10 and has completed independent review plus regression fixes. Studio uses verified browser PCM output through SDK custom IO. Live-provider acceptance remains pending; see the [verification record](docs/milestones/2026-11-04-livekit-default-migration.md).

“Default” means the recommended voice setup and Studio voice path. Core-only/text usage must still work without the optional LiveKit dependencies. Configure speech providers separately from the voice-session framework; a LiveKit integration that still requires Deepgram would not meet this milestone. Preserve developer-owned credentials and support self-hosted LiveKit without mandatory LiveKit Cloud/Inference.

The implementation design must cover:

- A single Libretto workflow authority behind LiveKit media/turn handling, with no duplicate automatic replies.
- A documented non-Deepgram voice configuration plus optional Deepgram configuration, using the same workflow without core changes.
- Studio's default voice connection, credentials and diagnostics migrated alongside the library quickstart.
- A clear compatibility path for existing direct-Deepgram configurations; no silent transport/provider fallback.
- Provider-independent turn detection and interrupted/readback delivery tests, including actual transport acknowledgement granularity.

### First: a feasibility spike with a decision record

Pin the SDK version at execution time. Start from the official [AgentSession documentation](https://docs.livekit.io/agents/logic/sessions/) and [events reference](https://docs.livekit.io/reference/agents/events/), checked on 2026-11-04. Use the official Python session/events/pipeline APIs to prove final transcript input, incremental speech output, cancellation, completion and interruption information. A transcript event or completed generation alone is not proof of delivered speech.

The spike must choose the single owner of automatic replies. LiveKit owns media/turn detection; Libretto owns workflow/evaluation/action authority. Suppress duplicate LiveKit automatic LLM replies in the chosen integration. Verify there is no loop feeding Libretto output back as user input.

If the supported SDK cannot establish delivery at the required granularity, disable delivery-gated actions for that integration with an actionable capability error. Do not weaken confirmation safety to make the demo run. Record that limitation and the next bounded experiment.

### Implementation packages after the spike

1. Create `src/libretto/integrations/livekit/` with an optional dependency group/extra and explicit lifecycle/capability adapter. Importing `libretto` must not import LiveKit.
2. Map finalized user turns, generation text, speech completion/interruption and close into the M1 facade. Carry session/request/epoch/message identity throughout.
3. Add a fake-LiveKit harness exercising duplicate/final/interim transcripts, stop-before-start, interruption, disconnection, late callbacks and shutdown while tools are pending.
4. Add `examples/livekit_repair/` with a short Python entrypoint, YAML, booking stub, `.env.example` names only and a README. The app registers tools in code; YAML does not execute Python or load arbitrary import paths.
5. Run an opt-in voice acceptance session with developer-owned credentials and a simulated booking. Record SDK/provider versions and what was physically verified.
6. Write `docs/livekit.md`: Git installation, SDK pin, local or developer-selected LiveKit connection, supported capabilities and limits. No Libretto cloud prerequisite.

### Exit gate

An external application starts the example using documented imports and its own configuration; speaks through the YAML workflow; handles an interrupted readback; executes the stub only after valid confirmation; and closes without orphaned tasks. Deterministic integration tests pass without credentials. A manual live check is reported separately from CI.

Do not promise support for every LiveKit plugin/realtime-model mode. The first supported configuration is the one proved by this slice. Detailed adapter signatures belong in the post-spike implementation plan, not invented against an untested SDK.

## M3 — tests and explanations developers can use

### Scenario contract

Add `src/libretto/testing/` and `tests/test_scenario_runner.py`. A YAML/JSON scenario names its workflow fixture, input turns, scripted evaluator proposals, delivery/interruption events and expected assertions. Keep credentials/provider configuration outside scenario files.

Assertions cover ordered stages, accepted facts, action count/result/argument fingerprint, absent actions, request boundaries, blocked reason codes, retrieved passage IDs and completion. Use fake providers and a controlled clock; no arbitrary sleeps or network calls in deterministic tests. Use a bounded event drain and report stalled runs clearly.

Add `libretto test <scenario-file-or-directory>` with exit code 0 for success, 1 for failed assertions, 2 for invalid inputs/setup. Emit a human-readable summary plus opt-in machine JSON. Golden event files exclude timing values that vary between runs.

### Debugging and exports

- Emit structured reasons for missing facts, absent consent, undelivered/stale confirmation, mismatched request, missing tool outcome and evaluator failure.
- Surface those reasons in Studio State/Trace with links to the relevant step/route/policy. Preserve the original event for inspection.
- Include workflow hash, YAML schema version, Libretto version/commit when available, model/speech configuration, request identity and test mode in an export envelope.
- Redact credentials and application-designated sensitive argument fields. A local exported transcript can still contain user data; the developer chooses whether to save/share it.
- Keep saved replay explicitly labelled as replay. It must never execute actions or start providers.

### Exit gate

A new workflow author writes a failing scenario for a blocked action, fixes the YAML, sees it pass, and opens enough evidence in Studio to explain the difference. CI runs the deterministic suite without paid inference. Semantic and acoustic evaluations remain separately opt-in and budget-bounded.

## M4 — make the OSS workflow easy to adopt

1. Confirm the repository license before presenting reuse terms as settled. MIT is a candidate for Prasad to choose; no license is selected by this roadmap.
2. Write one short text-first quickstart: Git install → YAML → registered stub → test → optional Studio → optional LiveKit.
3. Publish Git tags and migration notes; provide a pinned Git URL for reproducibility. Do not publish to PyPI.
4. Provide core-only installation and the documented Studio resource/build strategy. Test from a directory outside the checkout and without developer `.env` files.
5. Document supported Python/Node/LiveKit versions and schema/API compatibility. Reject unsupported versions with clear messages.
6. Ask three developers to run the guide, replace a field/prompt/tool, and explain one failure. Record actual steps and blockers with consent; never invent adoption metrics.
7. Prioritize the observed blockers, then repeat the failed tasks. “They liked the demo” is not the acceptance gate.

Target observation: a developer can reach a passing local text scenario in roughly 15 minutes from prerequisites already installed. This is a usability target, not a measured claim or release blocker based on an arbitrary stopwatch.

The blog and short demo can explain the shipped milestone. Use Prasad's writing skills; keep those deliverables separate from engineering acceptance and never promise unshipped integration APIs.

## M5 — what may be considered later

Possible candidates: retrieval relevance improvements, additional transport/provider adapters, better graph authoring, local replay, schema tooling or embedding Studio into a developer's local setup. Prioritize only after a concrete request and reproducible gap.

Do not turn this list into commitments. Accounts, billing, collaboration and managed hosting remain excluded even if the project gains users.

## Bounded maintenance lane

| Priority | Item | Acceptance |
| --- | --- | --- |
| High | Editor/import errors visible without opening Test | Invalid file import produces an actionable shell-level message and leaves the draft recoverable. |
| High | Collection switching cancels/stales pending retrieval | A delayed response cannot replace results for a newly selected collection. |
| Medium | Accepted-but-ignored layout hints | Implement them or report them unsupported; do not silently claim restoration. |
| Medium | Collection display names and passage matching | Consistent naming in details/usage and clear matching evidence. |
| Later | Dragging/Arrange, exit cycling, chip previews | Consider after observing navigation friction; selection remains stationary and explicit navigation stays available. |

Take at most one maintenance item alongside M1. A discovered correctness/security regression can interrupt the milestone; cosmetic additions cannot consume it indefinitely.

## Work tracking and definition of done

For every task record: milestone, outcome, dependencies, files/interfaces, acceptance tests, commit, status and remaining limitations. States: planned → active → verified → merged → deployed (only if it affects the public demo). A local library deliverable does not need a public deployment to be complete.

- Make regular focused commits and preserve unrelated local files.
- Run focused tests first, then applicable lint/backend/frontend/build/browser checks.
- Inspect actual screenshots and keyboard behavior for UI work.
- Review compatibility and applicable CI gates at the final head; do not infer them from local tests.
- Verify public health/assets/behavior after a requested demo deployment. A push is not deployment evidence.
- Do not make paid provider calls as hidden validation.
- Update this roadmap after a milestone, including what was learned and what changed in sequence.

## Decisions still requiring evidence or owner choice

| Decision | Resolution point | Constraint |
| --- | --- | --- |
| Repository license | Before reusable-release claims in M4; ideally before M1 release | Prasad chooses; do not silently add a license. |
| LiveKit output/delivery hooks and supported SDK pin | M2 spike | Never treat generated text as delivered audio. |
| Final public API naming | M1 facade/clean-install task | Small facade over existing runtime; no new engine. |
| Broader providers, persistence or transport modes | M5, if observed need | Developer-owned integration only; no hosted product expansion. |

## Immediate next work

Execute M1 from the linked plan. Start with regression fixtures and request/confirmation characterization, not another Studio redesign. The target is **two substantive agents, one reusable core**, then **one working LiveKit example**.
