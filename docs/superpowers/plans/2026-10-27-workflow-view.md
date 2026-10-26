# YAML workflow visualization

Add a read-only Workflow tab to the existing studio, matching the supplied ElevenLabs references: a dotted light canvas, white stage cards, curved arrows and dark condition labels. Keep the YAML editor as the source of truth; no node creation, dragging or connection editing.

Use React Flow for accessible pan/zoom/navigation and Dagre for automatic directed layout. Lazy-load this view. Visualize every declared stage and transition, including loops, parallel tool outcomes and deterministic predicates. Include a synthetic Start node. Show tool/knowledge badges and a selected-stage inspector with full prompts and transition conditions. Clicking a stage opens the inspector; an Edit instructions action opens its existing configuration form.

The draft graph follows readable YAML edits. Invalid syntax, missing destinations and excessive graph sizes show an actionable message rather than a stale graph. While a test is running, explicitly show the running workflow snapshot, with active/pending stage highlights; edits apply to the next test.

Verify graph mapping and layout with meaningful tests for cycles, parallel edges, malformed references and raw optional fields. Run frontend tests/build and existing backend checks. Inspect desktop/mobile behavior in the browser and deploy the verified batch to the existing subdomain. Commit regularly.
