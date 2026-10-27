# Call-quality fixes and evaluation

User authorized fixing the audited findings, recording TTFS/RAG timings, meaningful tests and an improved active-call UI with an immediate welcome.

- [x] Reconcile interruptions after synthesis completes while browser playback remains buffered. Skip cancellation roundtrips for fully played speech.
- [x] Add a YAML readback template rendered by the runtime from validated state; delivery binds the exact state fingerprint. Corrections invalidate confirmation and force a fresh readback without a second LLM request.
- [x] Improve evaluator instructions for accepting a named message offer and retaining earlier referenced questions. Preserve unknown-policy wording.
- [x] Implement per-turn retrieval timing, first-audio telemetry and first rendered-sample timing with same-clock latency summaries.
- [ ] Add a repeatable local evaluation suite and bounded opt-in real-model checks using fictional callers.
- [ ] Add active voice-call orb/status, prominent mute/end controls, and a literal YAML-configured startup greeting.
- [ ] Complete useful regressions, real-provider probes, independent review, browser verification, production deployment and hosted checks.

No serial classifier is added. Speaker and evaluator remain concurrent. Readbacks and welcome speech are literal runtime output. Acoustic speech-end is a microphone-activity estimate; output timestamp timing is estimated. Report endpoint-to-audio/playback separately, exclude greetings/readbacks/tool follow-ups from ordinary-reply summaries, and never infer historical timing that was not recorded. Keep raw personal call exports ignored and provider keys out of logs/artifacts. Calls remain capped at five minutes and production remains visitor-key-only.
