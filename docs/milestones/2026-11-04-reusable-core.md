# M1 reusable core verification

Branch: `feat/reusable-core-m1`, based on `ee94d01`. Implemented locally; final whole-branch review is pending. No merge, remote CI result, deployment or licensed release is claimed.

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

The full local checks passed: Ruff; 197 backend tests including a wheel installed/run outside the checkout with no FastAPI or LiveKit; 8 offline retrieval cases; 114 frontend tests; production build; 25 browser tests. Browser screenshots were inspected for the repair policy inspector and existing layout coverage remains in the suite. No paid model or speech calls were made.

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
