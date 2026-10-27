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

## Hosted verification

Application commit `fa8ee5d` deployed successfully on the existing Vercel Hobby plan, region `iad1`, with no funded provider keys. Homepage, generated JS/CSS/icon, public config/health and YAML routes returned 200. Hosted source validation accepts the unrelated minimal workflow and rejects invalid YAML with 422. A WebSocket start with that definition returns its workflow snapshot; the probe closed without requesting model output. Chrome verified the hosted workspace and actionable missing-key dialog.

Custom-domain follow-up on 2026-10-26: created the `libretto` DNS-only CNAME at Cloudflare and issued the Vercel certificate. Vercel confirms valid configuration. The authoritative nameserver and Cloudflare public resolver return the expected target. HTTPS homepage, generated JS/CSS/icon and health/config/YAML routes return 200 on https://libretto.prasadjs.me. Its secure WebSocket connects and returns the expected missing-key response. No model request was made by this probe. The custom hostname is now the primary demo URL. Other DNS records and nameservers were unchanged.

## Conversation and speech fixes — 2026-10-27

Investigated a visitor-exported call trace locally plus available Vercel error logs (no error rows returned in the 24-hour query). Detailed provider/state events were in the browser export, not platform request logs. The export contains personal contact details and remains ignored local diagnostic material; regression cases use invented callers and reserved phone numbers.

- Reproduced Flux TTS `MESSAGE-0000` with a fractional `time_ms` playback offset; the same probe with integer milliseconds succeeds. The adapter now floors the session-relative value. A subsequent live adapter probe performed two interruptions from fractional browser timestamps and completed another speech turn with zero speech errors.
- New-turn cancellation now identifies only affected replies. Full playback acknowledgements preserve heard history and do not mark completed replies interrupted; a late acknowledgement restores full transcript text without releasing a newer turn's action gate. Actual barge-in still uses the aligned spoken prefix.
- Retained diagnostics omit per-token and undrained playback noise, keeping lifecycle events and safe evaluation failure codes. Full response text and drained playback IDs remain available. No transcript or provider credential is persisted server-side.
- Broad catalog questions now retrieve concise plan/room overviews. Ranking weights headings, normalizes common English pricing/facility terms, and carries context for referential follow-ups. Names, phone numbers and acknowledgements no longer inherit unrelated room passages. This remains a small local lexical index, with no embedding service or serial LLM classifier.
- The evaluator has its own routing instructions, bounded condition/field names, required routing output and nullable entries for unknown/unchanged facts. Runtime evidence/type/readback/action validation remains authoritative. Live baseline probes reproduced inferred message consent, omitted routes and evidence from an earlier turn. Revised probes correctly routed an information enquiry into FAQ without message consent, answered plan and room prices, then collected all explicitly volunteered message facts and captured only after confirmed readback.
- Shared/stage prompts answer questions first, avoid repeated handoff offers, use spoken prose and distinguish acknowledgement from a completed action. Speaker and evaluator still run concurrently; no serial inference was added.

Independent read-only review found two additional edge cases: empty-token “How much?” follow-ups and late drain restoration after transcript prefix reconciliation. Both received regressions and fixes. Live probes were short, synthetic API checks; they do not establish browser microphone end-to-end latency percentiles or guarantee every possible conversation/retrieval result. A new full hosted voice conversation remains a useful acceptance check.

Application commit `14ba6dd` deployed successfully to production deployment `dpl_Hf6ZfdFWt7R1p6GLs5A7ueL5zbzA` at https://libretto.prasadjs.me. The deployed config includes the revised prompt, reports visitor-key mode and missing hosted provider keys, and rejects a keyless voice start with `missing_openrouter_key`. A bounded hosted WebSocket check supplied visitor keys, opened both speech transports, and exercised two typed questions through the real parallel model/evaluator/TTS pipeline: membership options and Loft room pricing. Both returned source passages and PCM audio, with zero speech/evaluation errors and zero completed replies reported interrupted. Playback acknowledgements were synthetic protocol inputs; this does not verify physical browser playback or microphone turn detection. Homepage, current JS bundle and health endpoint returned 200. Final local checks: 84 Python tests, 27 frontend tests, Ruff, TypeScript and production build passed.


## Call quality, timing and active-call UI — 2026-10-28

The runtime now renders confirmation readbacks from validated facts and binds completed playback to that exact snapshot. Corrections invalidate confirmation and force another readback. The speech adapter tracks completed-but-buffered output so a later interruption can still reconcile heard history. Fully played speech avoids an unnecessary interrupt roundtrip. Shared/evaluator wording preserves referenced message topics and distinguishes unpublished discounts from prohibited discounts. Speaker and evaluator remain concurrent.

A literal YAML welcome starts after voice transport readiness, with no model request. The active-call panel has a CSS orb, playback/listening/thinking/muted states, large mute/end controls and a compact mobile layout with safe-area support. No orb package was added. Desktop welcome/playback and controls were observed in Chrome; phone emulation verified the editor and YAML scrolling at 375×667 and 427×952. The final static active-call fixture could not be visually confirmed reliably; a physical-phone call and keyboard-open layout remain manual acceptance checks.

Exports record per-turn RAG duration, first server audio, browser audio arrival and first rendered playback. Same-browser-clock summaries separate endpoint-to-playback from estimated microphone-activity-to-output TTFS. Greetings, readbacks and tool-result follow-ups are excluded from ordinary-reply summaries. An independent review found a confirmed-transcript epoch/reference ordering issue; it was fixed with regressions before deployment. These timings are estimates, not a physical acoustic benchmark.

Final local checks: 97 Python tests and 33 frontend tests passed; Ruff, TypeScript and the Vite production build passed. The offline evaluation passed eight curated fact-retrieval cases. A prior bounded real-OpenRouter evaluation passed both message-topic/corrected-contact/capture and unavailable-transfer scenarios using fictional callers and simulated business actions. Real speech-protocol checks covered buffered interruptions. No broad conversational pass rate or acoustic percentile is established.

The single reported slow local call showed delay before the confirmed endpoint and before first model text; retrieval was 0.121 ms and the browser audio-arrival-to-playback gap was about 26 ms. A separate bounded full-text TTS probe did not reproduce large supply gaps, but does not reproduce the same streamed microphone call. Background noise, locality or provider timing cannot be assigned as the cause from this sample. At the user’s request, further live testing is deferred and detector thresholds remain unchanged. Raw personal call exports stay ignored locally.

Application commit `438a158` deployed successfully to `dpl_33DFQ35CWHGZnBZ8LGsrN63zu96G` at https://libretto.prasadjs.me. Hosted health, homepage and current JS/CSS returned successfully. Public config includes the welcome and runtime readback, a 300-second call limit, visitor-key mode and no hosted provider credentials. A keyless voice WebSocket start returned `missing_openrouter_key`. No further paid voice conversation was initiated for deployment verification.
