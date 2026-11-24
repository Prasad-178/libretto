# M4 first-workflow quickstart

Status: implemented, independently install-tested and reviewed locally; the single Important review finding is corrected and verified. No new release, registry publication or live-provider acceptance is claimed. The signing-key block was resolved on 2026-11-25; normal signed commits resumed without disabling signing.

## Developer outcome

The [quickstart](../quickstart.md) starts with an independent project containing three files: workflow, scenario and Python application. The workflow collects a support-request summary, invokes a fictional registered tool and ends. Its scenario checks zero actions before collection and exactly one action with the expected arguments afterward. The Python application separately executes the actual registered stub, using the existing public core API and fixed local inference.

The guide explains this distinction, a deliberately failing assertion, custom-tool validation/Studio registration, optional Studio resources, optional paid voice paths, and the pending license. No core, UI or provider behavior changes are included.

## Independent installation evidence — 2026-11-24

- Created a fresh environment in `/tmp/libretto-m4-quickstart.yFSTde`, outside the checkout, with Python 3.12.11.
- Used the documented remote Git install at `6991f77901ea45c6b91b3a643c7f0ebcc1585ab3`, the previously CI-verified/published core. Installed distributions: Libretto, Pydantic/Pydantic Core, PyYAML, annotated-types, typing-extensions and typing-inspection.
- Copied only the three new starter files from the current working tree. These are not in the older core pin or the wheel. The starter was uncommitted during verification and is not claimed to be available from remote main until pushed.
- `libretto test record-request.scenario.yaml --output evidence.json`: **1/1 PASS**, exit 0; correct evidence format.
- `python app.py`: stage `end`, tool `record_request`, status `recorded`, receipt `fictional-request-1`, arguments `summary: Printer is jammed`.
- Changing the final expected action count to 2 returned **exit 1**, with `action_count: expected 2, got 1`.
- Running the app in-process confirmed FastAPI, LiveKit, HTTPX and dotenv were absent from imported modules. No provider setup or environment-file loader was involved.
- New regression coverage copies the starter to a temporary project and runs its app from a different working directory. **3 tests passed**; the full backend suite passed **384 tests** in 49.11 seconds. Ruff passed for the core, tests and new example; changed-document relative links and `git diff --check` passed.

These checks establish a reproducible local scripted path on this Python/platform, not Windows execution, measured setup time, real language understanding, voice quality, or three outside-developer trials.

## Independent review and fix

A read-only GPT-6.2 Astra review reported one Important finding and no Critical/Minor findings: the original copy command assumed the new starter was already on remote main. Reproduced against an archive of published `6991f77`: copying failed because `examples/quickstart` was absent. The guide now starts from a checkout containing the new files, explicitly explains the unpublished state, and keeps the separately verified remote core pin. Executing the guide's actual copy commands from a materialized source checkout successfully copied the three files into a sibling project. No second review round was needed.

The reviewer also independently exercised missing-summary prevention, all three result outcomes, registered application execution from another working directory, and optional-import isolation. These are local scripted checks; hosted CI must be checked at the final pushed head.

## Commit handoff — 2026-11-25

The owner requested three commits with author dates November 19, 20 and 24. The starter/tests and developer guide are separate commits (`9b49ff1`, `78ea264`), followed by the roadmap/verification record. Normal committer timestamps record the actual commit creation date. Focused starter tests (3/3), Ruff and whitespace checks were rerun before committing. No push or new hosted CI is implied by these local commits.

## Remaining M4 gates

- Publish the new starter/docs after commits and final-head CI; no application deployment is necessary for this docs/example slice.
- Owner chooses the license before reusable-release claims. No tag/license has been added.
- Document a tagged compatibility baseline after that decision.
- Arrange three outside-developer trials only when authorized, observe setup/modification/debugging blockers, and fix the observed problems.
- User Studio review and the separate M2 voice-acceptance checklist remain pending, as requested. Do not block this offline documentation slice on those checks or imply that it completes them.
