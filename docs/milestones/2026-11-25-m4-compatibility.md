# M4 compatibility and setup slice

Status: compatibility guide and published quickstart refresh implemented locally; final review/checks pending. No license, release tag, registry publication, outreach or paid provider calls.

## Outcome

[Compatibility and setup](../compatibility.md) documents independent application installs, optional dependency profiles, default checkout groups, version evidence, file-format contracts and an application upgrade/rollback checklist. The quickstart's starter and core now both use public CI-passing `3c0795bfb8d13c703fa886a94b96b09a9144a98a`, removing the temporary unpublished-source instructions. The README, library and LiveKit guides link this entrypoint.

This documents the implementation as it exists; it adds no compatibility validator, API guarantee or new SDK/provider support. The supported CLI still uses `libretto`, not `python -m libretto`. Custom handlers remain explicitly registered by application code.

## Installation verification — 2026-11-25

- Public source cloned and detached at `3c0795b`; only three starter files copied into an independent sibling project.
- Fresh Python 3.12.11 environment installed the same remote Git core pin. Offline scenario passed **1/1** and the Python handler produced the documented fictional receipt with exact summary arguments.
- FastAPI, LiveKit, HTTPX and dotenv were absent from this core-only environment, checked through import discovery, not merely lack of imports.
- Wrong expected action count: CLI **exit 1**. Unsupported scenario version 2: CLI **exit 2**.
- `uv sync --locked --no-default-groups` in the separate source checkout installed only Libretto/Pydantic/PyYAML and their core transitive dependencies. Server/SDK/HTTP/dotenv remained absent.
- Installing the `[providers]` Git extra added HTTPX while FastAPI, LiveKit and dotenv remained absent.
- `[livekit]` was **resolver-checked only** with `uv pip install --dry-run`; it selected LiveKit Agents 1.8.10. No fresh full SDK install or voice session is claimed. Existing installed SDK metadata and the published baseline's CI provide separate integration evidence.
- Metadata checked: Python floor 3.12; CI Python 3.12/Node 24; local Python 3.12.11/Node 24.3.0/uv 0.9.0; installed LiveKit Agents 1.8.10. Node dependency engine ranges are described without claiming all allowed majors were tested.

## Local contract checks

- The quickstart's exact shell setup block was extracted and executed in another fresh temporary directory, followed by its scenario and application commands: **PASS**.
- The compatibility guide's exact core-only checkout block was extracted and executed against the independent pinned checkout: **PASS**.
- Existing install/schema/scenario/evidence/quickstart/LiveKit configuration checks: **114 passed** in 5.10 seconds.
- Existing Studio sidecar, saved-evidence and session-export tests: **16 passed** across 3 files. No browser/UI change is part of this slice, so no new browser run is claimed.
- Ruff, changed-document relative-link checks and `git diff --check`: **PASS**.

## Remaining gates

Final local review/checks and signed commits for this slice; hosted CI at its new head after a requested push. License selection and tagged-release policy remain owner decisions. Three outside-developer trials require authorization and actual observations. User Studio review and M2 real voice acceptance remain deferred independently. No application deployment is required for this documentation-only slice.
