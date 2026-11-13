# M3 local scenario runner — first slice

Status: **implemented and verified locally**, at code head `d4fc0a5`. M3 as a whole remains active. The owner explicitly authorized proceeding while the real-provider M2 check remains pending.

## Developer outcome

Run `uv run libretto test examples/scenarios` without credentials. Two fictional repair cases exercise actual YAML compilation, facts, stage transitions, request/confirmation rules and simulated tool dispatch. `--json` emits a stable summary; failed checkpoints report their step, expected value and observed value. Invalid setup exits 2; failed checks/runtime errors exit 1; passing suites exit 0.

The testing package uses public WorkflowRunner entry/delivery/interrupt/snapshot methods and an idle barrier over the existing tracked tasks, with a controlled runtime clock. It never loads application handlers or opens provider adapters. Tool signatures/results are explicit scenario data. It does not claim real language interpretation, speech recognition or audio playback.

## Verification

- Full backend suite: **330 passed**, including the clean-install smoke test outside the checkout.
- New scenario/CLI checks: **37 passed** within that suite.
- Bundled command: **2/2 scenarios passed**.
- Ruff over `src`, `tests`, `app.py`: passed.
- `git diff --check`: passed.
- No frontend files changed; the prior 159 frontend/79 browser results belong to the earlier UI pass, not a rerun here.
- No credentials read, paid inference, external messages, push, hosted CI or deployment.

Tests cover complete/partial/interrupted readbacks; later fresh approval; repeated requests; refusal/missing facts; failed/unknown tool outcomes; exhausted scripts; invalid evidence; controlled expiry; bounded stalls/event overflow with cleanup; exact arguments, request counts, fingerprints and retrieval identity assertions; stable reports; strict loading and CLI exit/discovery behavior. CLI import isolation checks do not import FastAPI, HTTP inference or LiveKit modules.

Commits: `6d8fa32` plan, `9dd5631` runner, `d4fc0a5` CLI/extended assertions/examples.

## Remaining M3 scope

1. Versioned reproducibility envelope: workflow hash/schema, Libretto version/commit, selected model/speech configuration, test mode and request identities.
2. Explicit developer-designated sensitive-field redaction in that envelope. Current local facts/argument summaries may contain application data and must be inspected before sharing.
3. Broader runtime diagnostic coverage, including missing facts/consent and readback/tool/evaluator failures, without weakening authority.
4. Studio evidence inspection with step/route/policy links, then explicitly labelled read-only replay. Replay must never start providers or tools.
5. Exercise the full author outcome: write a failing scenario, fix the YAML and inspect enough saved evidence to explain the difference.

This first contract intentionally settles scripted boundaries between steps; it is not a general concurrency scheduler, model evaluator or acoustic test harness. Recognition/voice behavior remains the [separate M2 acceptance](2026-11-13-live-voice-acceptance.md). The public demo/manual scenario cards are unchanged.

## Follow-up

The [evidence/Studio slice](2026-11-13-scenario-evidence.md) now implements the reproducibility/redaction envelope and read-only saved-event inspection. The remaining-scope list above describes the first-slice handoff; current next work is richer diagnostics and route/rule navigation.
