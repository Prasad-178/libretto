# Studio v2 implementation review

The final independent review covered `33b1521..dbf13e3`. It found no confirmed Critical issues, eleven Important issues and five Minor issues. Important findings received one regression-tested fix pass; no second review was requested. This is a local implementation record, not a hosted CI or merge-readiness attestation.

## Important findings addressed

1. Failed pre-ready starts release the frozen snapshot. Pending connections can be cancelled, and cancelled asynchronous audio setup cannot reopen a session.
2. Empty YAML remains editable; malformed form-facing field/model/speech/predicate shapes are refused before rendering forms.
3. Structural insertions patch existing containers without rewriting sibling text; collection updates preserve existing entries and comments. Deletions use local ranges where safe.
4. Form serialization quotes strings ambiguous under the Python YAML loader, including Yes/No/on/off.
5. Referenced fields cannot change type through Settings. Reference links explain what must change first; backend equality predicates must match the declared field type.
6. Session provider construction retains the selected response-reasoning setting.
7. Pinned layouts route connectors against final node boxes and move the synthetic Start with the actual start node. Overlapping pins that prevent a safe path produce a repair message.
8. Dagre uses generated internal node IDs; metadata position/name records have no prototype. Schema-valid constructor/toString/__proto__ IDs retain finite geometry and round-trip positions.
9. Settings history groups end on field blur/unmount.
10. Multiline hints/choices retain editing buffers and normalize on blur, allowing normal Enter-based typing.
11. Workflow limits agree on 100,000 Unicode characters and 256 transitions. Persisted invalid drafts are retained for correction/export rather than silently discarded on reload.

## Decisions and costs

- Ruling: T3-native worktree inventory reports isRepo=false because the thread is bound to the parent folder, not this nested repo. Use the Git-managed /Users/prasad/.codex/worktrees/libretto-studio-v2 workspace with explicit working directories — avoids altering main and preserves the user's untracked files — cost if wrong: app workspace UI may not show this worktree until selected.
- Ruling: Unreachable nodes remain a backend validation error under the current schema. The pure layout may place them diagnostically; never claim they are runnable — preserves runtime compatibility — cost if wrong: user must repair reachability before testing.
- Ruling: A bare conversation/action continuation is not automatic. StepComposer will require executable continuation/result mappings; legacy bare edges remain visible with warnings — prevents inserted nodes silently stalling — cost if wrong: adds required configuration during step creation.
- Task 1: Ruling: Existing precedence/result/Say behavior is covered by characterization tests rather than deliberately modifying the runtime to manufacture a failure — this is a compatibility-only change — cost if wrong: tests may preserve an existing runtime limitation. Say assertion uses response_done because trace intentionally excludes text_delta.
- Task 2: Ruling: Legacy insertStep keeps its external behavior during this foundation commit; Task 5 replaces it with configured atomic insertion — avoids mixing shell/insertion redesign into the source layer — cost if wrong: the existing insertion limitation remains on the feature branch until Task 5.
- Task 4: Ruling: Use SCC/condensed-DAG ordering as structural preprocessing and retain Dagre's cycle routing rather than adding a second geometry engine — existing engine passes required generic cases — cost if wrong: complex pinned layouts may need more routing refinement.
- Task 5: Ruling: Pull Playwright installation and the first shell/browser regression forward from Task 9 — user supplied actual evidence of the in-progress shell's missing CSS; native T3 browser timed out twice and native Chrome later remained stale/blank across reload — cost if wrong: earlier test-infrastructure commit than the planned final verification task. Full end-to-end coverage still belongs to Task 9. The screenshot arrived between shell JSX and its CSS; do not claim completion from a build.
- Task 5: Ruling: On structural topology changes, recompute unpinned node geometry instead of reusing obsolete positions with newly routed edges — the actual insertion screenshot showed crossing/reversed connectors, reproduced RED in graph-model.test.ts — cost if wrong: a structural edit can move unpinned nodes; prompt/condition edits and viewport zoom remain stable. Imported pins remain honored. Fresh insertion screenshot now shows a clean ordered Collect→Clarify→Acknowledge path.
- Task 7: Ruling: Consolidate README/architecture/testing edits from companion Task 3 into parent Task 9 documentation pass — those must describe the final integrated Sources/Settings UI rather than an intermediate API-only state — cost if wrong: docs lag on this feature branch until Task 9. API tests exercise temporary local workflows outside this repository and hosted restrictions without reading any user folders. Parent Task 8 owns endpoint/test integration.
- Task 8: Ruling: Connection settings use the same origin as Studio for HTTP and WebSocket; do not expose an editable remote endpoint before a complete cross-origin transport/credential capability is implemented — local projects already serve their own Studio, and this prevents an HTTP-only endpoint switch — cost if wrong: users must open the selected runtime's Studio rather than changing runtime URLs inside this release. The generic API client retains base-URL support for future transport integration.
- Task 9: Ruling: Browser tests start the real read-only backend alongside Vite and mock only the provider WebSocket boundary, instead of duplicating HTTP API responses — validates real source/validation contracts without paid inference — cost if wrong: browser tests require Python/uv as well as Node. WebSocket dev origin 5174 was rejected (RED), now explicitly allowed alongside 5173; foreign-origin rejection remains covered.
- Final: Ruling: Paid-provider voice/latency/credentials remain deliberate live checks, not inferred from scripted transport — no paid calls in this task — cost if wrong: live voice quality is unverified.
- Final: Ruling: Library packaging, PyPI, LiveKit, arbitrary tool implementations and generalized confirmation policy remain separate scope — this branch is the Studio redesign — cost if wrong: a generic SDK still needs follow-up work.
- Final: Ruling: Editable remote endpoints remain excluded under the same-origin decision — keeps HTTP/WS/credentials coherent — cost if wrong: users open the other runtime's Studio.
- Final: Ruling: Unreachable workflow rejection and legacy predicate-before-language semantics stand — preserve runtime compatibility — cost if wrong: invalid graphs need repair and legacy mixed rules remain surprising.
- Final: Ruling: Topology edits may move unpinned nodes; imported pins must have correct connectors and are fixed — executable edits invalidate old geometry — cost if wrong: edits may rearrange unpinned layout.
- Final: Ruling: Anchors/aliases remain refused rather than form-editable — backend already rejects them — cost if wrong: users must expand aliased YAML before use.
- Final: Ruling: Markdown changes are read on retrieval/inspection requests rather than watched automatically — no live-watch contract — cost if wrong: displayed evidence can lag until refreshed.
- Final: Ruling: Assess Paper through actual screenshots/usability without another external design review — user requested no further Pixel use — cost if wrong: visual parity gaps can remain.
- Final: Ruling: Hosted CI, merge/deployment gates and real-provider execution are not established by local checks — no PR/push/deployment in this task — cost if wrong: integration still needs its real gates.

## Deferred minor findings

- Sidecar groups and presentation overrides are accepted/exported but not rendered.
- Switching collection does not invalidate an in-flight retrieval response (query/step/source changes do).
- Node dragging/Arrange, E-key exit cycling and chip hover/focus previews remain absent; selection/Routes alternatives exist.
- Matched-term highlighting and consistent collection display names in detail/usage views remain incomplete.
- Import/startup errors can remain hidden when Test/connection panels are closed.

## Local verification after fixes

- Ruff: passed.
- Python: 123 tests passed.
- Frontend: 114 tests passed.
- Local retrieval: all 8 checks passed.
- Production build: passed.
- Browser: 21 checks passed with fresh hosted/local-project backends and Vite (`CI=1`). Includes real HTTP APIs, scripted WebSockets and screenshots. The pinned-layout screenshot was inspected after routing and label placement changes.

The full run additionally caught an automatic-validation timer superseding a requested Start validation; explicit validation now cancels that pending timer. The delayed-retrieval test waits for its interception handler to finish before teardown. Provider inference, hosted CI and deployment remain untested here.
