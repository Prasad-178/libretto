# M3 local scenarios implementation plan

> **For agentic workers:** Use native execution with test-driven checks, focused commits and the existing runtime. The owner explicitly requested proceeding with M3 on main.

**Goal:** A developer can run a local scenario file/directory and get useful workflow assertions without credentials, providers or application side effects.

**Architecture:** Strict scenario data supplies scripted evaluations and simulated tool contracts/results. WorkflowRunner remains the single execution authority. Scripted boundaries settle through an explicit idle barrier with a deadline and a bounded concurrent event drain; a controlled clock supplies runtime time. Reports contain deterministic summaries, not raw timestamps/random identities.

**Tech stack:** Existing Python/Pydantic/PyYAML/asyncio/argparse dependencies only.

**Spec:** ROADMAP.md, M3 scenario contract. This is the first executable slice, not all of M3: Studio evidence import/replay, redaction/envelopes and expanded runtime reason coverage remain subsequent work. M2 live acceptance remains pending independently, per owner instruction to proceed.

## Constraints and review focus

- Direct main commits; preserve unrelated files. No provider calls, dynamic tool imports or real application tool dispatch.
- Core-only install stays usable. Existing CLI commands remain compatible.
- Unexpected/exhausted scripted evaluations/tools must fail visibly rather than count as a passing recovery result.
- Invalid or ambiguous files (duplicate keys, aliases, wrong types/versions, empty suites) are setup errors.
- Interrupted/undelivered readbacks cannot authorize actions. Simulated delivery calls the public runner boundary.
- Negative action assertions execute after runtime work settles; don't pass because a task hasn't run yet.
- Runtime clock is controlled; real deadlines only guard a hung test. No sleeps for synchronization.

## Task 1 — contract and runner

Files: `src/libretto/testing/{__init__,schema,runner}.py`, `src/libretto/api.py`, `tests/test_scenario_runner.py`.

Interfaces: `load_scenario(path) -> Scenario`, `run_scenario(scenario, *, base_dir, timeout=2) -> ScenarioReport`. Public runner gains injectable clock and `wait_idle()` over current tracked runtime tasks; normal defaults stay unchanged.

- [ ] Write failing tests for a real field/transition scenario and failed assertions.
- [ ] Implement strict schema: turn/evaluation, delivery, interrupt, advance-clock and checkpoint assertions; explicit simulated tool parameters/results/responses.
- [ ] Implement runner, scripted adapters, event bound, timeout/cleanup and stable report. Exercise real compiler/runner with no test-support imports.
- [ ] Test successful/blocked/interrupted repair actions, stale approval, script exhaustion, repeated requests, runtime errors and expiry. Compare repeat-run JSON summaries.
- [ ] Test parser ambiguity/limits and public idle/clock compatibility. Run focused checks and commit.

## Task 2 — CLI and examples

Files: `src/libretto/testing/cli.py`, `src/libretto/cli.py`, `examples/scenarios/`, `tests/test_cli.py`, `docs/testing.md`.

- [ ] Write failing subprocess tests: passing scenario, failed assertion, invalid setup, empty suite, directory discovery and machine JSON.
- [ ] Add `libretto test <path> [--json]`: exit 0 success, 1 assertion/execution failure, 2 invalid input/setup. Sort discovery; setup errors take precedence in a mixed suite. Keep human output separate from machine JSON.
- [ ] Add runnable repair scenarios and a compact author guide explaining scripted-language/voice limitations.
- [ ] Run examples via CLI, complete backend suite/Ruff and clean-install check; update roadmap with remaining M3 work. Commit.
