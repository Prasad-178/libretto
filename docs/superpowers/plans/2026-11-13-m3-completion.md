# M3 diagnostics and navigation completion

**Goal:** Complete the local M3 author/debugger path instead of stopping after another partial slice. Owner asked to keep working through more tasks. Native test-first execution on main; regular focused commits.

**Spec:** ROADMAP.md M3 and its two completed local slices. M2 paid/live acceptance stays separately pending. Preserve unrelated files and all existing action/confirmation veto conditions.

## Tasks

- [ ] Add stable runtime diagnostics for missing facts, absent consent/acceptance, missing/mismatched request/readback, incomplete delivery and stale confirmation. Keep execution guard conditions unchanged; diagnostic helpers only explain a guard that has already vetoed dispatch. Include node, source/edge, policy and request references, with no fact values.
- [ ] Add readback/evaluation/generation/tool-outcome references and surface errors/unknown action outcomes in live/saved inspection. Test public-runner refusal/non-dispatch and pure classifier edge cases.
- [ ] Complete direct connection/rule navigation for matching saved source and unchanged live source. Reuse the existing inspector and staged rule dialog; do not mutate YAML on navigation. Stop is required before opening editable rule settings.
- [ ] Extract shared provenance metadata and include accurate workflow/model/speech/test-mode context in live server/browser exports without credentials. Keep scenario redaction and core-only imports working.
- [ ] Exercise fail → repair → pass with saved evidence and actual navigation. Run full backend/frontend/build/browser checks, inspect screenshots, document exact local M3 status and remaining external gates.

## Verification boundaries

Use deterministic providers and simulated handlers only. A reason code is evidence about a runtime decision, never inferred from generated text. Imported saved evidence must not start providers/tools. Source hash/identity mismatches cannot navigate to the wrong rule. Navigation alone creates no history entry; Cancel in settings preserves source. Remote CI, deployment, paid voice acceptance, license and external adoption are separate gates.
