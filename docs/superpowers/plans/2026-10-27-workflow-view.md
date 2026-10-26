# YAML workflow visualization

Add a read-only Workflow tab to the existing studio, matching the supplied ElevenLabs references: a dotted light canvas, white stage cards, curved arrows and dark condition labels. Keep the YAML editor as the source of truth; no node creation, dragging or connection editing.

Use React Flow for accessible pan/zoom/navigation and Dagre for automatic directed layout. Lazy-load this view. Visualize every declared stage and transition, including loops, parallel tool outcomes and deterministic predicates. Include a synthetic Start node. Show tool/knowledge badges and a selected-stage inspector with full prompts and transition conditions. Clicking a stage opens the inspector; an Edit instructions action opens its existing configuration form.

The draft graph follows readable YAML edits. Invalid syntax, missing destinations and excessive graph sizes show an actionable message rather than a stale graph. While a test is running, explicitly show the running workflow snapshot, with active/pending stage highlights; edits apply to the next test.

Verify graph mapping and layout with meaningful tests for cycles, parallel edges, malformed references and raw optional fields. Run frontend tests/build and existing backend checks. Inspect desktop/mobile behavior in the browser and deploy the verified batch to the existing subdomain. Commit regularly.

## Verified outcome

Implemented in `3373a3f`, `a32bd3c`, `e3da92d` and `122f2ad`.

- 20 frontend tests and 63 backend tests pass. TypeScript/Vite production build, Ruff and whitespace checks pass. Clean npm install reports no advisories.
- A fresh independent code review found four important issues: nested predicate grouping, hidden coexisting guards, nullable-tool compatibility and offscreen keyboard navigation. All were fixed. Predicate/nullable regressions are tested; cards explicitly center on keyboard focus and respect reduced motion.
- Browser verification covered the complete 11-stage/26-transition graph, full stage inspector, stage-editor shortcut, YAML-backed prompt edits, invalid YAML error state, reset recovery and graph fit controls.
- A 427px mobile inspection exposed loss of graph centering on resize. The corrected build was visually verified with Start and Identify intent still visible after desktop-to-mobile resize. The resize invariant has a regression test.
- Initial remote build failed because a fixture test depended on ambient Node types. The test now uses a Vite raw YAML import; subsequent clean Vercel builds pass.
- Application head `122f2ad` deployed as `dpl_GgRuwZvMUZKSxiahf2N9rpHw1tNR`, aliased to https://libretto.prasadjs.me. Public homepage, referenced assets, lazy graph JS/CSS and config return 200. The public browser page visibly shows Workflow and the correct stage/transition counts.

No visual graph editing was added. Pan/zoom/inspection are interactive; the YAML definition remains authoritative. Live highlight rendering uses the existing session state events; no new inference requests or voice pipeline changes were introduced.
