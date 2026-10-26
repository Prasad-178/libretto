# Prototype evidence and live-call checklist

Recorded 2026-10-26. Engineering evidence for a future article, not an article draft.

## Verified locally

- 57 Python tests passed; Ruff passed.
- Twelve frontend tests passed; TypeScript and Vite production build passed.
- `npm audit` reports zero advisories after updating Vitest to 5.0.5.
- Chrome verified the revised agent settings, prompt-to-YAML synchronization, direct code editing, successful validation, field-level rejection of invalid YAML, reset and bundled knowledge documents. Real microphone playback, mobile viewport behavior and a full live conversation remain unverified.
- Hosted health/config and WebSocket upgrade returned successfully. Starting without a key produced the expected missing-key response. A first-build frontend discovery failure was reproduced in a regression test and corrected.
- Examples/actions use fictional company information. Transfers/messages are session-only simulations. No API credential was available for live calls.

## Live benchmark record (pending)

Use an OpenRouter key and a direct Deepgram key, preferably dedicated and provider-budget-limited. Defaults: `google/gemini-3.5-flash` for speaking/evaluation; `flux-general-en` STT; `flux-haley-en` TTS. Verify account availability before comparing speed. A fake transport is not a live model test.

For each call record commit/region, browser/device/audio rate, model/provider route and versions, voice, detector thresholds, cold/warm state and network conditions. Include ordinary FAQ, contextual follow-up, directory ambiguity, failed transfer, corrected details, declined confirmation, interruption and spelled-number pauses.

For each turn record acoustic end, eager/confirmed EOT, retrieval start/end, model request/first text, first TTS audio received, first **meaningful** browser playback, evaluator completion, pending/committed stage and cancellation. Match epochs. Preserve audio locally only with the participant's agreement; do not commit recordings, contact details or API keys.

Report sample count, p50/p95, proportion above 1.5 seconds, failed/rerouted turns, cold starts and tool-dependent paths separately. Filler onset and the UI's RMS-based gap cannot substitute for acoustic-end-to-meaningful-speech measurement. No percentile or maximum is available yet.

## Article boundaries

Show what the graph/runtime guarantees and where probabilistic interpretation remains. Explain concurrent speaking/evaluation, immutable snapshots, every-turn retrieval, final-turn speech release and cancellation using measured traces. State session-only action limits clearly. Draft after reviewing the working demo and agreeing on a brief/outline.

## Review and revision

An independent whole-branch review of `52edd00..4901865` found six Important issues in confirmation ordering, interruption/cancellation, terminal cleanup, fresh-call playback and spoken history. These were reproduced and fixed with regressions. The subsequent user-requested workspace/YAML editor was tested directly; it was outside that independent review range. No merge-readiness or CI verdict is claimed.

The code editor is lazy-loaded. Forms and YAML share one document. The backend validates bounded YAML, registered mock tools and bundled knowledge paths. A new connection receives its own immutable workflow definition; changes never mutate another active caller.
