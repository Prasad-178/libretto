# M1 reusable core verification

Branch: `feat/reusable-core-m1`, based on `ee94d01`. Implemented and reviewed locally, with the single verified fix pass complete. No merge, remote CI result, deployment or licensed release is claimed.

[Specification](../superpowers/specs/2026-11-04-reusable-core.md) · [Plan](../superpowers/plans/2026-11-04-reusable-core.md) · [Library guide](../library.md) · [Migration](../migrations/request-policies.md)

## Implementation evidence

- `af5c422`: deterministic responder/evaluator/action harness.
- `1e62707`: empty developer registry and explicit demo tool composition.
- `cb13cee`: request identities and scoped reset.
- `708cb1c` / `72f98d6`: generic delivery-bound confirmation, migrated Northline.
- `3e20b17`: request-bound action identity, uncertainty and late callback handling.
- `2728125`: compiler, generic evaluator guidance and complete repair example.
- `8c31975`: public runner, shared Studio/CLI compiler and policy-preserving edit/export.
- Final distribution/documentation commit follows these changes; use Git history for its exact hash.

The full local checks passed: Ruff; 207 backend tests including a wheel installed/run outside the checkout with no FastAPI or LiveKit; 8 offline retrieval cases; 114 frontend tests; production build; 25 browser tests. Browser screenshots were inspected for the repair policy inspector and existing layout coverage remains in the suite. No paid model or speech calls were made.

Scenario owners: [request isolation](../../tests/test_requests.py), [delivery/punctuation](../../tests/test_confirmation.py), [action outcomes and late callbacks](../../tests/test_action_lifecycle.py), [compiler diagnostics](../../tests/test_compiler.py), [repair workflow](../../tests/test_repair_visit.py), [public API](../../tests/test_public_api.py), [clean installation](../../tests/test_install_smoke.py). Both examples compile against the same registry contract and execute through the same Session engine.

A core/provider source scan found no receptionist field/tool-specific authority branches in runtime, state, prompt composition, OpenRouter interpretation, compiler or generic registry. Domain rules remain explicit YAML guidance and demo handlers. A final audit additionally reproduced withdrawn consent retaining a permit, then fixed it with a failing-to-passing repair regression.

## Limits and remaining release gates

- The repository license is still an owner decision. No package registry publication.
- Handler callbacks and external service state remain application-owned. Definition/index/state/registration snapshots are detached; callbacks are not cloned.
- One active request, process-local deduplication, no durable action journal or exactly-once guarantee.
- LLM extraction and generated speech remain probabilistic. Local deterministic evidence does not establish live voice quality or provider latency.
- Studio assets/examples are provided by a source checkout, not bundled in the core wheel.
- LiveKit feasibility/integration remains M2. Accounts, billing, collaboration and managed hosting remain excluded.
- The branch's current CI workflow runs the same checks on push/PR. It has not run for an unpushed local head; merge readiness requires the applicable remote checks/review at the final head.

## Final review and fix pass

A fresh-context gpt-6-astra review inspected `ee94d01..409a04a`. It found no confirmed Critical issues, eight Important issues and one Minor. Commit `ba8424e` addresses all eight Important findings. Ten new regressions were observed failing before their fixes and passing afterwards; the complete backend suite is 207/207, with Ruff, retrieval8, frontend114, build and browser25 green. No second review round was used.

Fixed: wrong-epoch browser acknowledgements; historical receipts in new-request response context; request restart after cancellation; cancellation-resistant handlers blocking current progression; interrupted-readback recovery; say/end/action start semantics; explicitly waived delivery in external mode; and contradictory request/readback entry configuration. The delivery function is shared by browser playback and the public facade. Late callbacks no longer retain the transition lock, while identity and argument-deduplication guards remain.

Deferred minor: CLI schema failures are parsed before the compiler error formatter and may show a ValidationError traceback instead of the formatted diagnostic list. This does not permit invalid execution; address it in the maintenance lane.

## Execution rulings

These decisions are recorded for review, including temporary sequencing decisions now resolved:

- T3 inventory reports isRepo=false for the parent-bound thread; use a manually managed Git worktree with explicit workdirs, consistent with prior project work — preserves main/untracked files — cost: T3 workspace UI may not reflect this worktree.
- Task 1's confirmed-defect reproductions remain in plan scratch until Tasks 3–5 fix them, as the plan explicitly permits — no permanent xfails or red committed baseline — cost: temporary regression files are not shipped until their owning fixes.
- Create the complete repair fixture in Task6 alongside its supported policy schema rather than commit an incomplete placeholder now — avoids pretending a fixture is runnable — cost: second-domain fixture arrives later in M1.
- Keep the existing text-mode delivery convention until Task7 facade/transport alignment, while voice still requires playback acknowledgement — preserves current browser text tests during the coordinated migration — cost: internal Session text use is not yet the new explicit public runner contract.
- delayed callback behavior is covered once through the real Session generic action harness rather than duplicated in each domain fixture — avoids duplicate lifecycle tests — cost: domain-specific delayed callback wiring is inferred from shared dispatch.
- Studio text transport omits runtime welcome because Studio already renders its literal welcome; public runner emits it — preserves existing transcript contract — cost: adapters must avoid rendering that welcome twice.
- CLI validate uses empty registrations unless --demo-tools/default bundled workflow is selected; custom tools compile through Python application composition — YAML cannot choose executable imports — cost: custom-action CLI validation requires an application wrapper.
- execute Task8 final review as the post-task whole-branch phase required by executing-plans; task implementation completion does not claim reviewed/released — resolves circular task/review ordering — cost: review remains a separate gate.
- Live-provider semantics and acoustic quality remain unverified without deliberate live tests — accepted the documented scope/evidence after review — cost if wrong: unknown language/voice quality remains.
- Durable exactly-once execution, restart recovery and automatic retries remain outside the process-local contract — accepted the documented scope/evidence after review — cost if wrong: external idempotency remains application responsibility.
- LiveKit remains M2 — accepted the documented scope/evidence after review — cost if wrong: integration compatibility is unproven.
- Application handler closures/service clients are not cloned — accepted the documented scope/evidence after review — cost if wrong: caller changes can alter handler behavior.
- Compiled objects can be edited before runner construction; construction detaches them — accepted the documented scope/evidence after review — cost if wrong: callers must finalize configuration before creating a runner.
- Policies protect an explicit configured subset rather than every tool argument — accepted the documented scope/evidence after review — cost if wrong: applications can omit a safety-relevant field.
- Full graph liveness proofs remain out of scope; the concrete contradictory entry contract is rejected — accepted the documented scope/evidence after review — cost if wrong: other logically stalled graphs may still validate.
- Inherited session/time/turn limits remain unchanged in M1 — accepted the documented scope/evidence after review — cost if wrong: these limits may surprise library users.
- Worklet overflow is not treated as an authorization defect because the complete app path interrupts before drain — accepted the documented scope/evidence after review — cost if wrong: this relies on that browser event ordering.
- License selection, release, deployment and remote CI remain owner/external gates — accepted the documented scope/evidence after review — cost if wrong: local completion does not establish release or merge readiness.
