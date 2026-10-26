# Libretto: latency-first prototype proposal

Date: 2026-10-26

Status: approved direction on 2026-10-26. The user accepted the latency-first architecture and next-response transition policy. This note takes precedence over conflicting scheduling, retrieval, and speculation recommendations in the earlier design. Credential validation and measured performance remain outstanding.

## Confirmed requirements

- Libretto is a YAML-driven engine with shared conversational rules and focused stage prompts, tools, knowledge, and transition conditions.
- Build the complex generic receptionist demo using synthetic content, English only, real passage retrieval, and simulated business actions.
- Cap each demo conversation at 180 seconds. Session memory is sufficient for the proposed ephemeral demo; do not add a database service by default.
- Target free Vercel Hobby hosting and `libretto.prasadjs.me`. API usage may be paid. A small server-funded budget and optional visitor-supplied credentials are requested.
- Prioritize both low latency and explicit stage state. User target: about 1.0-1.2 seconds to first speech, with 1.5 seconds as the desired upper bound.
- Make regular, coherent commits throughout implementation.

## What the public docs establish

ElevenLabs describes semantic workflow conditions evaluated in parallel outside the active agent's prompt. Its workflow composes a shared base prompt, core tools, and global knowledge with focused stage instructions and capabilities. The public article does not specify enough to assert that every transition is delayed exactly one user turn, nor disclose its full cancellation/output-release algorithm. Its orchestration overhead claim is not an end-to-end voice latency guarantee.

LiveKit's current turn-handling documentation enables preemptive LLM generation by default. TTS waits for confirmed turns by default; speculative TTS is separately configurable. Agent handoffs can trigger another generation within the same user turn. An implementation must therefore define its own precise stage-commit and generation-boundary semantics instead of treating the phrase next turn as an API guarantee.

Deepgram currently recommends Flux TTS `/v2/speak` for new voice-agent integrations. It accepts text deltas and handles internal synthesis boundaries; client `Flush` ends an agent response. Flux STT `/v2/listen` provides contextual end-of-turn detection, eager events, and cancellation signals. These are appropriate current candidates, but public documentation is not evidence that a particular voice/route is fastest in this deployment.

## Proposed ordinary-turn execution

Remove a mandatory serial evaluator request from the speaking critical path. Use three independently scheduled lanes:

1. The active stage's speaking model reads the confirmed stage snapshot, shared prompt, conversation, and authorized retrieval context, and streams a reply.
2. A compact semantic evaluator proposes typed facts and permitted condition matches for controller validation. It runs alongside the speaking path and may prepare a pending stage for the next generation boundary.
3. An inexpensive read-only retrieval lane searches the small in-memory corpus without waiting for an LLM to label the turn FAQ.

Start safe work on Flux eager end-of-turn signals where appropriate. Do not generate on every unstable interim token by default. Bind speculative candidates to the exact transcript, source stage/configuration, relevant facts and retrieval revision, and work epoch. Commit neither business state nor actions from a speculative candidate. Before releasing speech, final input must match the candidate's expected input. Cancel and replace candidates on resumed speech or relevant context changes. Never feed unaccepted speculative text into live TTS by default.

Preemptive generation and parallel evaluation are core proposed optimizations for the latency-focused version, rather than features automatically postponed until after a shipped serial demo. A simple serial mode can remain as a debugging/measurement comparison, not the public demo's assumed default.

## Stage timing proposal and limitations

Keep `active_stage`, `pending_stage`, `configuration_revision`, `turn_id`, and work epoch explicit. Every speaking generation is attributed to a fixed active-stage snapshot; do not silently change its prompt/tool permissions midway through streaming. The controller alone may commit a validated graph transition.

For ordinary conversational progression, propose applying an evaluator's transition at the next response/generation boundary. A current stage may finish its permitted reply while the evaluator prepares the destination configuration. This can occur before the next user input if a node explicitly generates on entry; next response does not necessarily mean an extra user turn is required.

Delaying a transition is appropriate only if the current stage is allowed to produce the current response. A correction that makes that response/action invalid, a change in permissions, or a destination-specific answer cannot be ignored merely to avoid waiting. Such an edge requires cancellation/re-generation or an explicit synchronization point. Completed-action claims still require an actual tool result. Do not promise that every possible path has no dependency waits.

If the evaluator is late, expose that state. Never let a stale result overwrite a newer caller correction. The no-wait ordinary path continues under the same active stage, but pending actions remain blocked until their prerequisites are authoritative. Apply a valid pending transition at the next generation boundary; an edge requiring new permissions or authoritative action prerequisites must explicitly synchronize or cancel/re-generate incompatible output. Acceptance must cover quick caller follow-ups, conflicting model interpretations, and delayed evaluator completion.

Shared prompt rules should let an agent answer authorized public company questions and acknowledge corrections while retaining its main task. This avoids forcing a stage switch merely to answer one side question. Stage isolation continues to control objectives, private knowledge scopes if added later, and business-action capabilities.

## Retrieval proposal

For the small demo corpus, search on every nonempty user turn (and optionally earlier on the stable eager transcript), rather than first asking a classifier whether the turn is FAQ. Even an acknowledgment may run through the cheap local search; no semantic classifier is needed to decide whether to start it. Include only bounded, relevant results. The known shared corpus is safe for all receptionist stages; stage-restricted corpora remain filtered by the active configuration. The decision to expose a source is deterministic configuration, not a model's permission decision.

Build contextual search input from the current utterance and recent relevant conversation. The first version should not require a serial LLM query-rewriting call. A follow-up such as what about weekends needs the preceding topic. The speaking model uses retrieved evidence where appropriate and ignores unrelated passages; insufficient evidence leads to clarification or an explicit unanswered question. Record retrieval duration, source IDs, and failures. Lexical retrieval has limitations; no claim of semantic-equivalence recall or calibrated confidence is made.

FAQ remains a useful stage for a sustained information request, not a gate that must be classified before any retrieval or factual reply can happen. ElevenLabs also publicly supports every-turn retrieval as a configuration mode; this does not imply reproducing its retrieval internals.

## Latency measurements and model choices

Measure user acoustic end to the first meaningful audible response in the browser. Include endpointing, transport, retrieval where required, model time, TTS, and playback buffering. Keep filler onset separate from substantive speech. Record EOT detection and first text/audio as component metrics, not substitutes for the user-perceived measure.

Treat 1.0-1.2 seconds as the target for ordinary warm turns and 1.5 seconds as a threshold to flag. Report percentiles, sample counts, the fraction exceeding 1.5 seconds, and every routing/re-generation failure. Report cold starts and tool-dependent paths separately rather than hiding them. A universal hard maximum cannot be guaranteed across third-party service latency, throttling, packet loss, and arbitrary caller devices.

Use persistent provider connections, a stable shared prompt prefix, small stage prompts/tool schemas, minimal supported reasoning, bounded output, and progressive browser playback. Select the speaking/evaluator models and provider routing from measured TTFT and quality, not model-family naming alone. Gemini 3.5 Flash is a candidate; a smaller independently configurable evaluator is appropriate. Prompt-cache effects are opportunistic and must be measured.

Use Flux STT's eager/confirmed turn signals and stage-sensitive detection profiles. Initial thresholds previously proposed are test inputs, not measured optimums. Do not add a second fixed endpointing delay after Flux's confirmed signal. Keep longer pause tolerance for spelled details, instrument timeout-triggered turns, and test interruption false positives. Preemptive TTS remains optional after the draft/commit path is correct.

## Visitor-supplied keys

Provide optional masked OpenRouter and Deepgram key inputs, with a visible indication of whether each provider is using the hosted budget or the visitor's credential. A visitor key is confined to that browser tab's memory and the corresponding backend session over HTTPS/WSS. Do not put it in localStorage, sessionStorage, cookies, URLs, YAML, logs, traces, analytics, or exports. Drop session credential references at session end. Server-funded keys never go to the browser. Keep authentication per session/request rather than mutating a shared client's default credential. Switching keys does not restart the 180-second call timer.

Provider credentials are independent: replacing an exhausted OpenRouter key does not replenish a Deepgram speech budget. Allow either or both visitor keys. Distinguish exhausted-credit errors from invalid credentials or rate limiting. Prompt to switch credentials and resume/retry the appropriate read-only operation; do not replay an uncertain business action. Constrain provider hosts in code, not visitor-configurable URLs. Account/provider-level key limits bound the shared budget; process-local counters are not a deployment-wide spending cap.

## Outstanding validation

- Confirm availability of a direct Deepgram credential for the hosted speech path and visitor BYOK option.
- Verify selected models/voices against the account and benchmark from the deployment region before claiming the latency target is met.

No provider account, DNS record, deployment, or product implementation was changed by this discussion note.

## Public references

- ElevenLabs orchestration, shared configuration, and parallel conditions: https://elevenlabs.io/blog/unpacking-elevenagents-orchestration-engine
- ElevenLabs every-turn versus on-demand retrieval: https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/rag
- LiveKit preemptive generation and optional preemptive TTS: https://docs.livekit.io/reference/agents/turn-handling-options/
- LiveKit handoffs and generation behavior: https://docs.livekit.io/agents/logic/agents-handoffs/
- Flux TTS streaming guidance: https://developers.deepgram.com/docs/flux-tts/quickstart
- Flux STT configuration and eager signals: https://developers.deepgram.com/docs/flux/configuration
