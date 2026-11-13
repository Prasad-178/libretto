# Studio and runtime verification

Run the automated checks from the repository root:

```sh
uv sync --locked
npm --prefix web ci
uv run ruff check src tests app.py
uv run pytest -q
uv run libretto evaluate
npm --prefix web test
npm --prefix web run build
(cd web && npx playwright install chromium)
npm --prefix web run test:e2e
```

Playwright starts the Python backend on port 8000 a local-project backend on 8002, and Vite on 5174, reusing local servers outside CI. Start with these ports free for a fully isolated run; CI starts both itself. HTTP validation, source inspection and retrieval use the real local backend. The conversation test scripts the WebSocket boundary, so these browser checks never invoke paid models or speech providers. A passing scripted test does not establish real-provider voice quality.

The browser suite covers 1440/1280/1024 layouts, inspector widths, expanded prompt editing, keyboard focus restoration, reduced-motion settings, route search/reveal, grouped Undo, configured insertion, invalid drafts and the last-valid graph, exact export filenames/bytes, source scope and ranked evidence, stale retrieval rejection, immutable test snapshots/Stop, failed-start recovery/cancellation, empty and malformed draft recovery, pinned-layout restoration, Settings typing/Undo boundaries, connected shared destinations, and workflow renaming with Undo, restored drafts and matching export filenames. Routes remains a searchable index inside Flow rather than a separate primary tab. Screenshots and failed-run traces are written to `web/test-results/`; inspect these when changing layout. Frontend unit tests additionally cover ten generic graph fixtures, route conservation, source-preserving edits, metadata and history. Backend tests use temporary projects for local-folder containment and source manifests.

## Reusable core checks

`tests/test_install_smoke.py` builds a wheel, installs core dependencies in a temporary environment outside the checkout, and executes a registered stub through public imports with no FastAPI, LiveKit, demo files or provider keys. It uses uv/build dependency resolution and may need network/cache access; it makes no paid inference calls. Request, confirmation, action-lifecycle and public-API tests use fake providers and event barriers. `test_repair_visit.py` covers the second domain. Browser YAML checks import that example, edit its prompt and verify its policy declarations survive export.

## Fictional coworking front desk

Northline Workspace is an invented coworking business. All prices, policies, staff, addresses and caller profiles are fake. Caller telephone numbers use the reserved fictional 202-555-01xx range. No customer accounts, live availability or external business systems exist.

Open the demo's **Scenarios** tab in the test panel. Expand a scenario to see the caller lines, expected behavior, source documents and manual checks. **Prepare scenario** selects the simulated transfer outcome and puts the first line into the composer. It does not connect, send a message, invoke a model or spend API credits. Start a test explicitly using your own keys, then speak the suggested line or send it from the composer. Next line only prepares another draft. End a test before choosing a different outcome.

There are 15 scripts spanning pricing, membership comparisons, meeting-room policies, successful/unavailable/failed/timed-out transfers, callback corrections, side questions, withdrawn requests, unsupported discounts, nonexistent booking/account access, voice interruption and attempts to bypass required confirmations. The corpus is `examples/test-scenarios.json`; each scenario has a repeatable transfer setting and expected observations.

| Fictional fact | Reference |
| --- | --- |
| Day pass: £25, one weekday, shared desk/Wi-Fi/tea/coffee | `memberships.md` |
| Flex: £220/month, eight weekday visits, no rollover | `memberships.md` |
| Resident: £360/month, unlimited weekday visits, assigned desk, four room-credit hours | `memberships.md` |
| Dock: four people, £18/hour | `rooms.md` |
| Loft: eight people, £32/hour | `rooms.md` |
| Room cancellations: at least 24 hours for the published full-refund rule | `rooms.md` |
| Membership cancellation: 30 calendar days' notice | `memberships.md` |
| All access/support: weekdays 9 AM–5 PM London time; weekends closed | `company.md`, `support.md` |

Published rules can be explained; the agent cannot process payments/refunds, inspect accounts, book rooms, send emails or deliver a message outside the session. The room schedule is static for 2 November 2026, and unlisted slots do not establish availability.

Use **Sources** to inspect retrieved passages, **State** to inspect confirmed facts and action receipts, **Workflow** for active/pending stages, and **Trace** for event ordering. A corrected phone number requires a fresh complete readback before capture. A refused message must produce no capture receipt. Generated or interrupted speech must not be mistaken for a fully heard confirmation.

The Scenarios tab remains a set of manual expectations. Separately, `uv run libretto evaluate` runs eight fact-retrieval checks without APIs, and `uv run libretto evaluate --live` opts into bounded real-model workflow checks for message/correction/capture and an unavailable transfer. Unit tests verify fixture consistency, retrieval inputs in actual multi-turn runtime prompts, action prerequisites and UI preparation behavior without paid inference. Speaker/evaluator interpretation, voice quality and interruption timing still need deliberate live tests. The bounded live checks have passed; they do not establish a general model pass rate or acoustic latency benchmark.

Retrieval weights current terms and headings, normalizes common English pricing/facility words, and carries prior context for referential follow-ups. Contact details and acknowledgements do not inherit unrelated passages. Search remains local and returns at most three passages to the runtime; no classifier/model request is added.

Export session now contains `timings.responses`, `timings.retrieval_attempts` and `timings.summary`. Confirmed-turn RAG samples exclude cancelled drafts; the attempt list retains them for diagnosis. Estimated TTFS subtracts a microphone-activity estimate from estimated first rendered output on the browser clock. Endpoint-to-audio and endpoint-to-playback use the browser's receipt of the committed transcript as a separate baseline. First server audio has its own trace event. Microphone chunking, background noise, output latency estimates and clock/event delivery affect these values; collect several quiet/noisy, warm/cold and local/hosted calls before drawing conclusions. The one reported slow local call is retained only as ignored local diagnostics. Listening thresholds were not changed from that single observation.

## LiveKit migration verification

`tests/test_livekit_adapter.py` exercises the actual pinned SDK with synthetic STT/TTS and verified custom output; no inference credentials or paid calls. `test_livekit_review.py` reproduces failed partial synthesis through the default SDK TTS node, blocked producer cancellation/shutdown and recovery, and rejection of text-mode runners for voice. `test_livekit_config.py` validates explicit gateway/plugin construction and credential selection without opening services. `test_livekit_server.py` isolates providers while testing the real HTTP/WebSocket application. `studio-livekit.spec.ts` captures the default connection/model settings and verifies credential exclusion from drafts. See [LiveKit limits](livekit.md); passing these tests does not establish live-provider voice quality.

## Offline scenario files

M3's first slice adds `libretto test` over the same compiler and `WorkflowRunner` used by applications. It supplies scripted inference and simulated tool contracts/results; it never imports application handlers or starts provider/network adapters. No credentials are needed. These tests establish runtime behavior for the supplied interpretations, not whether a real model would produce those interpretations or a listener would hear synthesized audio.

```sh
uv run libretto test examples/scenarios
uv run libretto test examples/scenarios/repair-booking.scenario.yaml --json
```

An explicit file can contain YAML or JSON. Directory discovery recursively selects `*.scenario.yaml`, `*.scenario.yml` and `*.scenario.json` in sorted order; unrelated files are ignored. Relative `workflow` paths resolve from the scenario file's folder. Knowledge paths resolve from the workflow's folder and retain compiler containment checks. Use version `1`; duplicate keys, aliases, excessive nesting, files above 100,000 characters, unknown settings and repeated turn IDs are rejected. Scenarios have at most 200 steps.

A scenario declares `name`, `workflow`, optional `reply` (a fixed scripted responder string), `tools`, and `steps`. Each simulated tool lists required parameter names/types (`string` or `boolean`), all declared `results`, and ordered `responses` containing `status` and optional `data`. Compilation validates the workflow against these contracts, including failed/unknown recovery. The runtime calls only these simulated handlers. Running out of scripted results always fails, even if the runtime conservatively records an unknown outcome.

Supported steps:

| `kind` | Settings | Behavior |
| --- | --- | --- |
| `turn` | unique `id`, nonblank `text`, `evaluation` | Submit through the public facade. Evaluation uses the existing updates/evidence/matches/control schema; runtime evidence and confirmation checks still apply. |
| `deliver` | `policy`, optional `completed` (default true) | Acknowledge that policy's current runtime readback through the public delivery boundary. False simulates partial delivery. It is not a claim that real audio played. |
| `interrupt` | none | Interrupt the current generation through the facade. |
| `advance` | `seconds` from 0 to 300 | Advance the controlled runtime clock without sleeping. Existing session limits still apply. |
| `expect` | one or more assertions below | Inspect a detached state snapshot after tracked work has settled. |

Checkpoint assertions: `stage`, `facts` (subset with exact value/type), `absent_facts`, `action_count`, ordered `action_results`, ordered exact `action_arguments`, ordered `argument_fingerprints`, current request name `request`, and `request_count` (distinct requests observed so far). Checkpoint action count is the count of actual receipts, not model-generated claims. An expectation failure records the step and continues so later failures remain visible.

Final assertions: `expected_stages` checks the entire ordered stage path including the initial stage; `expected_codes` requires each named blocked/expiry code; `expected_passages` requires each retrieved chunk ID; `completed` checks that an ended/expired event occurred. Evaluation/generation errors always fail; listing their code does not turn them into expected success. The runner closes after each scenario. That cleanup alone never counts as conversation completion.

Exit codes: **0** all scenarios pass; **1** assertion/runtime failure; **2** invalid input/setup (including an empty suite). Setup errors take precedence in mixed suites. JSON output contains `passed`, `scenarios` and `errors`, without human log lines. Reports contain stages, accepted facts, actions with arguments/result/fingerprint and normalized request labels, reason codes, retrieved chunk IDs and completion. They omit random execution identities, transcripts and timing values. Scenario/report facts and arguments can still contain private application data; inspect before sharing.

Each run uses an injected clock and a bounded concurrent event drain. `WorkflowRunner.wait_idle()` waits for its tracked work, including follow-on tasks, without granting delivery. The scenario runner applies a two-second wall-clock stall deadline and a 5,000-event limit. These are failure guards, not latency measurements; no arbitrary sleep controls progression. A consuming application using `wait_idle()` must consume events concurrently and apply its own appropriate deadline for real providers/tools.

Remaining M3 work: a versioned reproducibility/redaction envelope, expanded blocked-reason coverage and Studio evidence inspection/replay. Current JSON summaries are not replay files and cannot be imported into Studio. Existing manual scenario cards remain separate. Real voice acceptance is still the [pending M2 gate](milestones/2026-11-13-live-voice-acceptance.md).
