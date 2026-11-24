# M4 first-workflow quickstart implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A developer installs the core from Git, copies three starter files into an independent folder, and runs both an offline scenario and a registered Python tool without credentials.

**Architecture:** Use the existing compiler, WorkflowRunner and scenario CLI unchanged. A small support-request example demonstrates required facts and simulated tool dispatch; the repair example remains the reference for readback/approval policies. Documentation distinguishes scripted inference, registered handlers, optional Studio and optional voice.

**Tech stack:** Python 3.12+, uv, YAML, pytest; Node only for optional Studio.

**Spec:** ROADMAP.md, “M4 — make the OSS workflow easy to adopt”; docs/product-direction.md.

## Global constraints

- Work directly on main with regular focused commits; preserve unrelated untracked documentation.
- GitHub/source distribution only. Do not publish registry packages or choose a license.
- No paid calls, environment-file loading, external developer outreach or voice-acceptance claims.
- No new core API, dependencies, server/UI features or confirmation semantics.
- Existing user authorization is to proceed with the next task; execute this bounded slice without a new approval pause. Publication/tagging and outside trials are separate.

## Review focus

- Starter files must work after copying outside the checkout, independent of the current working directory.
- A missing required fact must prevent tool execution.
- Scenario success must not be presented as execution of the application's Python handler.
- Broken expectations must return CLI exit 1; invalid setup must remain actionable.
- Core-only install must not import FastAPI, HTTPX or LiveKit or require provider credentials.

### Task 1: Runnable starter

**Files:** Create `examples/quickstart/{workflow.yaml,record-request.scenario.yaml,app.py}` and `tests/test_quickstart.py`.

**Interfaces:** Existing `compile_workflow`, `ToolRegistry`, `WorkflowRunner` and `libretto test`. New example `run()` returns no public API; `create_tools()` registers a fictional `record_request(summary: string)` handler returning `recorded`, `failed` or `unknown`.

- [x] Add regressions for copied starter execution from another working directory; no receipt before summary; one receipt with exact summary after extraction; failed scenario assertion exits 1.
- [x] Run `uv run pytest tests/test_quickstart.py -q` before starter exists; expect failure for missing starter files.
- [x] Implement a three-node collect → record → end workflow, a scenario covering missing/collected details, and a bounded application using scripted providers and the real registered stub. Print only stage, tool and receipt summary.
- [x] Run focused tests and Ruff. Expect all pass. Commit the starter.

### Task 2: Guide, independent installation and handoff

**Files:** Create `docs/quickstart.md`, `docs/milestones/2026-11-24-m4-quickstart.md`; modify `README.md`, `docs/library.md`, `ROADMAP.md`.

**Interfaces:** Task 1's three files and command outputs. Pin the core Git install to the existing CI-verified `6991f77901ea45c6b91b3a643c7f0ebcc1585ab3`; copy starter files from the checkout. Clearly identify the core pin separately from starter source.

- [x] Write the guide: prerequisites; clone/copy starter; isolated pinned core install; passing scenario/evidence; Python tool execution; edit prompt and summary; deliberate failing assertion; optional Studio/LiveKit handoff; troubleshooting and license caveat.
- [x] From a temporary directory outside the checkout, create a Python 3.12 environment, install the exact documented remote Git pin, copy only starter files, and run scenario CLI and app without credentials. Confirm no optional integration modules are imported and a deliberately changed expectation exits 1.
- [x] Run backend tests and Ruff; check changed Markdown links and diff whitespace. Record exact commands/results without adoption or voice claims.
- [x] Refresh roadmap status for the already verified publication and mark M4 active, with license/tags/outside trials still pending. Link quickstart prominently. Commit documentation.
- [x] Obtain one read-only whole-slice review, address Important/Critical findings in one focused regression-driven pass, and leave a clear handoff. No deployment is needed for docs/example changes.

## Execution note

Implementation and verification are complete locally. The signing-key block was resolved on 2026-11-25. The slice is split into three normal signed commits, with owner-requested author dates November 19, 20 and 24 and actual committer timestamps. Signing was not bypassed. The guide’s single Important review finding was reproduced against published source and corrected to use the checkout containing the starter. See the milestone record for evidence.
