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

The browser suite covers 1440/1280/1024 layouts, inspector widths, expanded prompt editing, keyboard focus restoration, reduced-motion settings, route search/reveal, grouped Undo, configured insertion, invalid drafts and the last-valid graph, exact export filenames/bytes, source scope and ranked evidence, stale retrieval rejection, immutable test snapshots/Stop, failed-start recovery/cancellation, empty and malformed draft recovery, pinned-layout restoration, and Settings typing/Undo boundaries. Screenshots and failed-run traces are written to `web/test-results/`; inspect these when changing layout. Frontend unit tests additionally cover ten generic graph fixtures, route conservation, source-preserving edits, metadata and history. Backend tests use temporary projects for local-folder containment and source manifests.

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

`tests/test_livekit_adapter.py` exercises the actual pinned SDK with synthetic STT/TTS and verified custom output; no inference credentials or paid calls. `test_livekit_config.py` validates explicit gateway/plugin construction and credential selection without opening services. `test_livekit_server.py` isolates providers while testing the real HTTP/WebSocket application. `studio-livekit.spec.ts` captures the default connection/model settings and verifies credential exclusion from drafts. See [LiveKit limits](livekit.md); passing these tests does not establish live-provider voice quality.
