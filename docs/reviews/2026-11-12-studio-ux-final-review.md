# Studio UX rollout: final independent review and response

Reviewed range: `f92752a..bb97338`. Independent reviewer: GPT-6 Astra, maximum reasoning, read-only. No second review round. The reviewer confirmed three Important findings, one Minor finding and no Critical finding. Its synthetic speech checks passed 46 cases; broader suite totals below are the implementer’s verification, not an independent rerun.

## Important findings addressed

1. **Omitted task fields crashed Collected data.** `RequestSpec.fields` defaults to `[]`; `definitionUses` now follows that default. Function, React rendering and actual browser recovery regressions cover `requests: {empty: {}}`.
2. **Some field IDs produced non-runnable readbacks.** Forms and compilation reject attribute/index/positional placeholder expressions. Plain literal IDs, including hyphens, spaces and Unicode, remain supported. Tests cover rename refusal, compiler rejection and actual public-runner readback execution with doubled-brace literals. No confirmation authority was relaxed.
3. **Incomplete kind conversion and inactive controls.** Step settings now stage action tool/input/result configuration and first outgoing connections, using existing commands. Retained action settings remain editable on other kinds. Conversion may explicitly replace old routing with complete result bindings; ordinary action-edit recovery guards remain strict. Save blocks unapplied local action edits. All operations join the same Save/Cancel/Undo transaction. Successful fresh and retained-tool conversions, cancellation/history boundaries and the 1024px modal footer are covered.

Fix commits: `6bf8ee2` and `686b19a`. Code head `686b19a` passed 293 backend tests, 159 frontend tests, 72 sequential browser tests, Ruff, production build, local retrieval evaluation and diff checks. See the [implementation coverage](2026-11-11-studio-implementation-coverage.md). Local evidence does not establish hosted CI, deployment or live-provider acoustic/semantic acceptance.

## Deferred minors

- successful voice-discovery cache has no expiry/manual refresh or visible checkedAt. No credential-scope leak confirmed; custom IDs and credential reset remain supported.
- compressed CSS additions and repeated expanded-editor lifecycle merit a later focused readability cleanup; keep outside this correctness pass.

## Rulings I made

This is the exhaustive chronological decision record, including superseded access/transitional rulings and the cost if each decision is wrong.

- Task 1: Ruling: Paper file returns unavailable despite being listed open, twice via get_basic_info — implement independently specified recovery/control fixes first and defer new-layout fidelity until direct design access returns — cost if wrong: visual rollout remains incomplete.

- Task 3: Ruling: proceed with independently specified reasoning compatibility while Paper blocks layout work — no new UI claimed — cost if wrong: remaining UI cannot consume new choices until its task resumes.

- Task 1: Ruling: sidebar destinations Tools/Collected data route to separated existing controls; Speech/Models retain existing editors until their full redesign — keeps every visible destination functional without duplicate document state — cost if wrong: transitional layouts persist until subsequent tasks.

- Task 2: Ruling: dialogs stage source-preserving typed operations and validate the final combined draft on Save, rather than rejecting each intermediate rule field change — enables atomic request/flag/scope edits without a second execution model — cost if wrong: a missed validator may allow a non-runnable draft (backend compile still gates tests).

- Task 2: Ruling: focused rule editing is a subview of the same native dialog with Back, not a nested dialog — retains one Save/Cancel transaction and avoids focus/hidden-change problems — cost if wrong: layout differs from a separate overlay despite matching content.

- Task 2: Ruling: readbacks use a textarea plus stable-ID insertion and friendly blue field preview instead of a contenteditable token editor — avoids corrupting braces/caret/source through rich-text normalization — cost if wrong: less visual parity with inline chips.

- Task 3: Ruling: do not label a hand-picked catalog subset Popular without upstream ranking evidence — ship all searchable text models plus Custom ID — cost if wrong: one extra search instead of an opinionated shortlist.

- Task 3: Ruling: retain evaluator minimal-effort runtime contract and explain provider compatibility rather than silently rewriting it when models change — approved no-new-controller-effort boundary — cost if wrong: users must test compatibility of their chosen controller model.

- Task 4: Ruling: map interrupted provider prefixes back to original source conservatively, dropping a partially heard substituted term and unrecognized normalization — prevents phonetic spellings or invented complete words entering authoritative history — cost if wrong: interrupted heard-history may be shorter than actual audio, while full generated text remains available.

- Task 4: Ruling: retain and label LiveKit recognition hints inactive rather than expanding adapter tuning while shipping the approved UI — spec explicitly permits honest inactive guidance — cost if wrong: users must use Direct Deepgram for hints until a separately verified adapter capability lands.

- Task 4: Ruling: 1024×640 CSS-space keyboard checks approximate the layout available at 125% on 1280×800; do not claim actual browser zoom/acoustic acceptance — deterministic reflow evidence only — cost if wrong: browser-specific zoom quirks can remain.

- Task 5: Ruling: implement a typed list-move operation so route ordering moves original blocks, not just their parsed values — comments belong with their route; sequence-level leading comments stay at the sequence — cost if wrong: unusual YAML token layouts may need a safe refusal rather than normalization.

- Task 6: Ruling: read-only knowledge APIs parse schema-valid current YAML and enforce the same bundled/project/symlink rules, without requiring unrelated tool contracts to compile — retains current knowledge when a required action outcome is missing, while /validate and test startup still require full compilation — cost if wrong: unrelated schema errors still require the labelled previous valid configuration rather than a partial arbitrary projection.

- Final: Ruling: live-provider acoustic/semantic acceptance remains outside deterministic UI completion — no real credentials or paid execution authorized in this rollout — cost if wrong: real provider behavior remains unproven.

- Final: Ruling: current external catalog responses/provider compatibility remain runtime-dependent; use upstream metadata and preserve custom IDs — no authenticated discovery or paid calls in review — cost if wrong: a provider/catalog can change after local evidence.

- Final: Ruling: M3 scenario-platform completeness is outside the approved rollout — these checks reuse the existing runner, not a new platform — cost if wrong: scenario authoring still requires the separate M3 milestone.

- Final: Ruling: pixel-exact Paper parity is not established; direct JSX supplies layout values and screenshots verify usability — cost if wrong: visual differences can remain despite usable controls.

- Final: Ruling: real browser zoom, cross-browser and assistive technology acceptance are not established by CSS-space/keyboard checks — cost if wrong: browser/AT-specific issues may remain.

- Final: Ruling: LiveKit recognition hints/patient activation and controller effort redesign stay explicitly inactive/separate as approved — cost if wrong: some retained settings need another integration or a later capability change.

- Final: Ruling: no invented popularity rankings, exhaustive inference voice list, cloning or automatic previews — upstream capability boundary and existing rulings stand — cost if wrong: more manual search/custom IDs are required.

- Final: Ruling: hosted CI/merge/deployment readiness remain unestablished at this local head — no push or deployment requested in this rollout — cost if wrong: remote environment issues remain untested.

- Final: Ruling: private/unrelated files remain excluded from review and implementation — user boundaries take precedence — cost if wrong: no conclusions cover those files.

- Final: Ruling: reject attribute/index/positional syntax in readback placeholders at both form and compiler boundaries rather than introduce a new substitution engine — preserves plain Python format_map lookups and doubled braces; field IDs remain otherwise legal outside readbacks — cost if wrong: a formerly accepted but non-runnable readback must be corrected before compilation.
