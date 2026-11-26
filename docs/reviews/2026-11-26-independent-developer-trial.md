# Independent developer trial and DX comparison

Date: 2026-11-26. Baseline: source release `v0.1.0` (`e0928b0`).

## Method and limits

An agent followed the published quickstart from a fresh temporary directory, cloned the public tag, installed the core from Git into a separate virtual environment, and ran the starter without credentials. It then renamed the tool, result and collected field across the application, workflow and scenario and repeated both execution paths. Error paths and a custom Studio application were tried separately. This is an independent agent trial, not an outside-human usability test or real-provider voice acceptance. No accounts were created, paid inference invoked, or application secrets inspected.

The comparison below is based on current official documentation, not authenticated hands-on use of competing services. Temporary logs and fictional project files live outside the repository; only findings and repeatable regressions are committed.

## Observations

- Fresh Git install, starter scenario, saved evidence, and Python handler execution succeeded.
- Changing `record_request` to `save_note`, `recorded` to `saved`, and `summary` to `issue` succeeded in both the scenario and application. The application returned the declared receipt and mapped input.
- Standalone validation correctly rejected the custom handler; this CLI cannot import application factories. The guide explains that boundary, but the transition into a custom Studio app needs a complete runnable recipe.
- A missing workflow and malformed YAML in `graph` produced Python tracebacks instead of actionable CLI diagnostics.
- Core-only `serve` produced a missing-Uvicorn traceback without explaining the Studio extra.
- Offline `evaluate` imported the OpenRouter adapter and failed without HTTPX, despite requiring no model calls. Its eight questions are specific to the Northline retrieval fixture; it is not a generic project evaluator.
- A custom `create_app(..., tool_factory=...)` tried to read the bundled receptionist's `directory.json` even though the consumer supplied its own tools and workflow. In a wheel installation that file does not exist. With checkout assets it also unnecessarily injected fictional demo context.
- The custom graph also opened in a browser with no page errors. Editing a prompt, runtime-validating the draft and downloading YAML retained the edit without overwriting the original project file.
- Command help remains shared across commands. `python -m libretto` is not supported. These are lower-priority discoverability gaps, not reasons to add another execution engine.

## Fixes in this pass

Expected CLI source-read and graph-parse failures now produce diagnostics with exit code 2. Existing compiler diagnostics retain exit code 1. Missing Studio dependencies explain the source-install extra and checkout setup. Offline retrieval no longer imports the optional model adapter. Explicit custom tool factories no longer load the demo directory or advertise receptionist-specific limitations.

Regression coverage includes an isolated core-only wheel, not just a checkout where optional dependencies already exist. The wheel check executes an actual application handler, a scenario, offline retrieval, and the missing-Studio-dependency path. Review also identified collection-valued YAML keys escaping as a Python type error and missing Studio workflow files escaping during startup. Both now have regression tests and actionable diagnostics. A server regression constructs a custom app in an asset root containing no demo examples.

## Useful patterns from other tools

[LiveKit's voice quickstart](https://docs.livekit.io/agents/start/voice-ai/) presents a generated starter followed by a run/debug loop and guided first changes. Borrow the continuity between starter code, scenarios and inspection. Libretto should print a local Studio URL and explain which application registry is running. Cloud login and managed deployment are outside Libretto's scope.

[Pipecat's quickstart](https://docs.pipecat.ai/pipecat/get-started/quickstart) creates a project with `pipecat init quickstart`, runs it locally and gives the client URL and first-start expectations. Borrow a self-contained starter and explicit local launch instructions. Keep provider credentials and optional dependencies distinct from the core-only first result.

[Vapi's CLI](https://docs.vapi.ai/cli) connects generated integration files with local development. Its [configuration-as-code guide](https://docs.vapi.ai/config-as-code) separates local validation from applying configuration. Borrow explicit validation and execution boundaries, while keeping Libretto projects developer-owned files and Python handlers. Hosted organizations, phone provisioning and deployment promotion are not planned.

[ElevenLabs' quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart) introduces instructions, first message, knowledge, voice and testing in a clear progression. Borrow contextual explanations and a visible first-test path. Its post-conversation success evaluation must not be confused with Libretto's executable tool-result branches or guarded confirmation authority.

## Recommended next design slice

Make **one custom local project easy to start, test and inspect** before expanding runtime features.

1. Define a starter with YAML, Python tool registrations and an offline scenario that can be copied or scaffolded without credentials.
2. Define one explicit application entrypoint shared by compilation and Studio. YAML must never import arbitrary Python automatically. Decide how a CLI launch selects this entrypoint before implementing it.
3. Add a local configuration preflight that distinguishes missing assets, optional extras, invalid workflow, missing application handlers and missing voice credentials. It must work without making provider calls.
4. Give each command its own help and next-step guidance. Keep scenario simulation visibly separate from invoking an application handler or paid voice provider.
5. Repeat the complete path with three outside developers and use their observed friction to choose the next iteration. Keep acoustic voice verification separate.

`init`, a project manifest, and preflight commands are proposals for discussion, not features shipped by this fix pass. No accounts, billing, collaboration or managed hosted product is introduced.

## Verification record

The first fix commit is `5568f76`. Before review, Ruff and all 387 backend tests passed, including the isolated wheel. One independent read-only review found no Critical or Important issues and two pre-existing Minor diagnostic gaps; both were reproduced with failing tests and fixed in a follow-up. The follow-up is `89b2ede`; final verification passed Ruff, 389 backend tests, all five bundled scenarios and all eight offline retrieval checks. The browser walkthrough also passed custom graph loading, prompt editing, runtime validation and YAML download. Browser evidence is local and contains only the fictional custom project. No frontend source or release tag changed; hosted CI and paid acoustic acceptance are not established by this local run.
