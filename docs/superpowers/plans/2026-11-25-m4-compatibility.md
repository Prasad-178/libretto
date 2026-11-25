# M4 compatibility and setup guide

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Explain the current source-install, runtime and file-format boundaries and give developers a verified upgrade path.

**Architecture:** Documentation only. Read dependency metadata, CI and implemented format readers; verify core and provider installs in disposable projects. Keep one CI-passing source pin across starter/core guidance. No new compatibility guarantees or runtime enforcement.

**Tech stack:** Python 3.12, uv, Git, existing scenario CLI; Node 24 for the existing Studio build.

**Spec:** ROADMAP.md, M4 source installation and compatibility requirements; docs/product-direction.md.

## Global constraints

- Main checkout, normal signed commits, unrelated untracked documentation untouched.
- No registry publication, license choice, tag creation, outreach or paid inference.
- Voice/UI reviews stay deferred; a docs/example change does not need a production deployment.
- Describe declared floors and verified versions separately. Do not claim an untested OS/provider matrix.
- Documentation introduces no new API/schema guarantee. Existing implementation and tests are authoritative.

## Review focus

- `uv sync` default groups versus an actual core-only environment.
- Public starter files are available at the documented source pin, separately from wheel contents.
- Custom tools require explicit Python registration, even when Studio can inspect the YAML.
- YAML, sidecar, scenario and saved evidence version numbers are separate contracts.
- Upgrades preserve source/lockfiles and require matching Studio assets; no silent migration/retry guarantee.

### Task 1: Verify installation matrix

- [ ] Inspect pyproject, lockfiles, CI, public exports and file readers.
- [ ] In a temporary remote checkout at CI-verified `3c0795bfb8d13c703fa886a94b96b09a9144a98a`, execute the pinned starter/core setup and positive/negative scenarios.
- [ ] Verify `uv sync --locked --no-default-groups` does not install optional SDK/server/HTTP dependencies; verify the providers extra adds HTTPX without LiveKit/FastAPI.
- [ ] Record exact versions and scope; resolver-only checks must be labelled as such.

### Task 2: Write and integrate the guide

**Create:** docs/compatibility.md, docs/milestones/2026-11-25-m4-compatibility.md.
**Modify:** README.md, docs/library.md, docs/livekit.md, docs/quickstart.md, ROADMAP.md.

- [ ] Document install profiles, version evidence, separate format contracts, public API boundaries, source-preserving upgrade/rollback checklist and existing migrations.
- [ ] Replace temporary unpublished quickstart instructions with a remote source pin that actually includes the starter; align the core pin.
- [ ] Link the guide and record M4 progress, leaving license/tags/outside trials pending. Commit this substantive documentation slice.

### Task 3: Verify and review

- [ ] Check changed relative links and whitespace; run existing install/schema/scenario/quickstart tests as appropriate to the documented claims.
- [ ] Obtain one read-only final review of the documentation slice. Correct concrete Important/Critical findings once, using a reproduced failure and a verified corrected command/claim. No new unrelated features.
- [ ] Record checks and limitations; make a normal signed completion commit. Do not claim hosted CI at the new head without pushing and observing it. Publication is separate unless requested.
