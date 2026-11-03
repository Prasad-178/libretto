# Libretto product direction

Status: approved direction and exclusions, confirmed by Prasad on 2026-11-04. Technical contracts in the linked implementation spec are planned work, not shipped APIs.

> An open-source tool that lets developers define, test, and run voice-agent workflows in YAML, with Studio as the visual editor and debugger.

## Audience and problem

The primary user is a developer building a voice agent inside their own application. They need explicit stages, transitions, typed information, action prerequisites, and evidence explaining what happened. They should be able to inspect a definition in Git, test important scenarios, and register application code without editing Libretto internals.

Libretto gives the runtime authority over allowed transitions and actions. Models interpret language and propose state updates; their interpretation and generated wording remain probabilistic. The promise is enforceable execution rules and inspectable behavior, not deterministic language understanding.

## Product ownership

| Part | Responsibility |
| --- | --- |
| Core library | Load/compile YAML; own workflow/session/request state, transition rules, confirmation validity, action dispatch, cancellation, and events. |
| Developer application | Supply tools and application context, choose providers, own credentials and business data, handle durable side effects and deployment. |
| Optional integrations | Connect the same core to an execution/media framework, beginning with LiveKit. They must not introduce another workflow authority. |
| Studio | Visualize and edit YAML, validate definitions, run deliberate tests, inspect state/routes/sources/receipts, and debug failures. |
| Documentation/examples | Explain contracts and provide working, independently reproducible examples. |

The library works without Studio, a Libretto account, a Libretto API service, or an outbound dependency on libretto.prasadjs.me. A developer may run a local test server or publish their own application. Neither is a managed Libretto product.

## Permanent product exclusions

Do not add accounts, sign-in/profile management, organizations, billing, subscriptions, paid plans, collaboration, shared/team workspaces, invitations, or account-backed workflow storage. Do not retain them as “later” roadmap items.

Studio will always be a visualization/editor/testing/debugging companion. It will not become a production fleet dashboard, hosted agent control plane, CRM, telephony business suite, or workflow marketplace.

There is no plan for Libretto-operated production agents, managed deployments, a hosted session store, or funded shared inference. The public website can demonstrate and test the tool with explicit user-supplied credentials and clearly labelled simulated actions. Public availability of the demo does not change this boundary.

A consuming application can have its own customers/accounts and business logic. These exclusions govern Libretto's product features, not which domains developers can model.

## Distribution and integration

Keep source and tagged releases on GitHub. Support editable checkout installs and direct Git installs pinned to a tag or commit. A Python package/import is compatible with this choice; publishing to PyPI is not part of the plan.

The repository currently uses distribution name `libretto-voice` and import namespace `libretto`. Avoid an unnecessary rename. Verify clean installation outside the repository before documenting the new public API as available.

LiveKit is the first optional integration. Core imports and text tests must not import or require LiveKit. Developers choose their own LiveKit deployment and provider accounts; the integration does not require a Libretto-hosted service.

## Principles for decisions

1. Prove a useful developer outcome before adding abstraction. Two distinct action workflows are the initial proof.
2. Keep one execution authority. YAML, the compiler, and the core runtime define behavior; Studio and integrations consume them.
3. Keep execution control separate from language interpretation and audio delivery. An emitted or generated sentence is not proof the user heard it.
4. Detect invalid action bindings before a test starts. Explain blocked actions and failed evaluations.
5. Preserve developer-owned source, local project boundaries, credentials, and explicit export semantics.
6. Prefer a complete working integration over a broad provider/plugin matrix.
7. Fix usability blockers within a bounded maintenance lane. Do not let cosmetic iteration replace the library milestone.
8. Use deterministic tests for runtime contracts, opt-in model tests for semantics, and deliberate voice checks for acoustic behavior. Do not mix their claims.

## Success and non-goals

The next milestone succeeds when Northline and a repair-visit agent run through the same core without modifying it; a developer can then use that core in one LiveKit example. The adoption milestone succeeds when three outside developers run and modify their own workflow, with observed setup friction recorded.

Do not optimize for account signups, paid conversions, hosted minutes, a speculative market size, or a large feature count. Early evidence is whether developers can integrate, test, understand, and reuse Libretto.

## Governance and continuity

[ROADMAP.md](../ROADMAP.md) owns sequencing, milestones, acceptance gates, and the bounded backlog. Technical specs own interface decisions for each implementation slice. Older reviews are evidence from their date, not automatically current defects.

Before adding work, identify the milestone it advances, its concrete developer outcome, its acceptance check, and what it displaces. Work that fits none stays out of the active plan.

Only an explicit new direction from Prasad can change these product boundaries. Do not infer a hosted product from requests for polish, demos, growth, deployment, or adoption.
