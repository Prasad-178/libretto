# M2 live voice acceptance

Status: **prepared, not executed**. This closes the remaining M2 evidence gap; it is not another Studio redesign. Automated synthetic/provider-isolated checks remain separate evidence.

## Scope and prerequisites

Use the fictional repair example, one local browser and one microphone. The only action is `book_visit`, the application-owned simulated handler in `examples/repair_visit/tools.py`. Do not connect a real booking system. No WebRTC room adapter, provider matrix or acoustic benchmark is part of this check.

Before connecting, agree on the developer-owned credential route, maximum usage budget and session duration. A working key is not spending authorization. Prefer session-only Connection inputs; never copy keys into this document, YAML, screenshots or exported evidence. Default inference requires LiveKit API key/secret for speech and an OpenRouter key for response/controller models. Direct-provider credentials are an alternative documented in [LiveKit](../livekit.md).

From the checkout, after dependencies and Studio assets are installed/built:

```sh
uv run python -m examples.livekit_repair --port 8003
```

Open `http://127.0.0.1:8003/studio`. This separate port avoids accidentally testing the Northline demo already running on 8000. Confirm the workflow is **Repair visit**, the action is **book_visit**, and speech uses the intended LiveKit configuration. Starting the server does not start a paid voice session; pressing Test/connecting does.

Record the commit, Python and installed LiveKit Agents versions, browser/OS, input/output devices, selected STT/TTS/voice, response/controller model IDs and credential route. Never record credential values. Use headphones to avoid feedback. Stop each test when its checks are complete; start a fresh session for each case except the repeated-request case.

## Cases

Use fictional details only. Suggested opening: “Please arrange an oven repair for Taylor at 7 Test Street in the morning.” Inspect accepted facts and actual receipts in State/Trace; generated success wording is not evidence of an action.

| Case | Steps | Required observations |
| --- | --- | --- |
| Normal booking | Supply details; wait for the entire readback; approve on the next turn | One recognized turn per utterance, one audible reply rather than duplicate SDK/core replies, a complete readback, and exactly one `booked` tool receipt with the supplied arguments |
| Correct details | At readback say “Change the address to 8 New Street”; approve only after the corrected readback finishes | No booking from old approval; new readback speaks 8 New Street; one receipt uses the corrected address |
| Interrupt readback | Speak over the readback halfway through, then request it again; hear the fresh readback and approve | Audio stops; partial output cannot authorize a booking; a fresh full readback followed by a later approval can book exactly once |
| Refuse | After details/readback, say “No, I don't want to arrange this visit” | No booking receipt; conversation can conclude without claiming success |
| Repeated request | Complete a booking; request another identical visit in the same session | Second visit requires its own readback/approval; two distinct receipts/action identities, with no reused approval |
| Stop and reconnect | Stop during speech; start a fresh test and complete the normal case | Old output does not continue or book; the new session works; no remaining microphone activity after Stop |

Natural-language interpretation can fail even with correct runtime authority. Record both separately. If an utterance is transcribed incorrectly, preserve that observation; do not silently rewrite the transcript and report a voice pass. Text submissions can help isolate a defect but do not replace the spoken case.

Abort on unexpected real side effects, uncontrolled repeated provider requests, budget exhaustion or loss of Stop control. Failed authentication is a failed setup check, not an acoustic result. Do not automatically switch provider/model to hide a failure.

## Evidence record

Copy this section into a dated local report after execution. Keep the record untracked if it contains private data. Check any export before sharing; transcripts can contain personal information even when credentials are excluded.

- Code commit / execution date:
- Python / Libretto / LiveKit versions:
- Browser / OS / devices:
- STT / TTS / voice / response model / controller model:
- Credential route (names only):
- Agreed budget and duration / observed usage (or unavailable):
- Per-case result: pass, fail, or not run; actual transcript; observed readback; action count, arguments and receipt identities; interruption/stop observations:
- Redacted evidence location:
- Defects and reproduction steps:
- Remaining unverified behavior:

M2 live acceptance passes only when all six cases have actual observations and failures are resolved or explicitly left blocking. Record perceived quality/latency as observations, not general performance claims. This checklist does not establish remote CI, deployment, durable exactly-once execution or room playback guarantees.

## Preparation verification — 2026-11-13

At baseline `d6a9da4`, the existing LiveKit adapter, review-regression, configuration and server suites were rerun: **27 passed**. The example's `--help` confirms the separate-port command is supported. No provider credentials were read and no live inference was invoked. These are preparation checks, not completed acceptance cases.
