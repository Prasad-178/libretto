# M3 scenario evidence and Studio inspection

Status: **implemented and verified locally**, following the [first scenario slice](2026-11-13-local-scenarios.md). M3 remains active; real-provider M2 acceptance remains separately pending.

## Delivered

`libretto test <file-or-directory> --output evidence.json` saves a version-1 scenario-evidence bundle. Runs include workflow SHA-256/schema/ID, package/source provenance, model/speech configuration, scripted mode, normalized request references and projected semantic events. Atomic output protects existing artifacts on setup failure and refuses to overwrite scenario/workflow inputs. Source hashing preserves CRLF.

Scenario `sensitive_fields` validates against workflow IDs. Original values still drive runtime checks; reports redact designated facts, mapped arguments, normalized/escaped values in failed assertions and affected argument fingerprints. Raw prompts/YAML/dialogue/audio, credentials, fact evidence, retrieved text and arbitrary tool-result payloads are not part of the projection. This is scoped data redaction, not automatic anonymization.

Studio's **Test & debug → Open saved test** opens a bounded local file in a separate dialog. It displays failed checks, reason codes, state at each event, simulated action outcomes and provenance. Previous/Next and scenario selection only move through saved data. Editor navigation requires matching source SHA-256 and an existing node. Invalid files are recoverable, focus returns on close, and replay is disabled while a live test is active. No runtime/session state is populated from imported evidence.

See the [author/format guide](../scenario-evidence.md).

## Verification

At implementation head `8150d97` (backend privacy/source corrections in `ad82210`):

- Backend: **344 passed**, including clean installation outside the checkout.
- Frontend: **170 passed**.
- Sequential browser suite: **83 passed**.
- New evidence browser checks: four cases covering 1440/1024, failed-import recovery, exact-source navigation and scenario switching; runtime WebSocket count remains zero during saved replay.
- Production build, Ruff and diff checks passed.
- Both bundled scenario exports pass, with address redaction enabled.

Actual 1440/1024 screenshots were inspected for the dialog layout, contained event/detail scrolling, readable diagnostic and redacted state, and reachable footer controls. Final focused captures disable transitions so selection styling is captured after settling. Selection/focus behavior has explicit assertions.

Tests additionally reproduce escaped-value/hash leakage boundaries, unknown redaction IDs, invalid-input diagnostic privacy, safe output failure, no workflow overwrite, CRLF matching, and editing a repair predicate to fail then restoring it to pass with different source hashes/event paths. The outside-developer adoption gate has not been performed.

No paid providers, credential reads, external messages, push, hosted CI or deployment. Local evidence is not remote CI/release readiness. UI tests used the real local app and CLI-generated evidence; the saved viewer has no SessionClient/provider dependency.

Commits: `7cb61f1` export/redaction, `ad82210` privacy/source safeguards, `8150d97` Studio reader/replay. Later documentation and screenshot-assertion-only commits do not change execution behavior.

## Remaining M3 scope

1. Replace generic missing-prerequisite explanations with stable reason codes and missing-field/policy references. Preserve the original live runtime event and execution authority.
2. Direct route/confirmation-rule navigation, beyond the current matching-source step navigation.
3. Check the full debugging exit gate against those diagnostics. Saved scenario artifacts do not replace live-session exports, acoustic acceptance or semantic evaluation.

This slice deliberately keeps replay as manual event inspection. It cannot import code, issue instructions to the runtime, rerun scenarios, synthesize audio or dispatch tools.
