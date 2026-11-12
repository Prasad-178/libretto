# Studio screenshot polish

Follow-up to the owner's eleven screenshot crops, applied on local `main`. This is a focused interface pass; executable YAML, graph topology, provider configuration and runtime authority remain unchanged.

| Before | After | Why |
| --- | --- | --- |
| Prompt/Connections/Knowledge tabs sit against the header divider | Vertically centred, 48px navigation row with consistent spacing | Readable hierarchy and reliable click targets |
| Connection cards lose horizontal padding through an older v2 rule | 14px/16px inset content, restrained white surface and edit chevron | Route labels, destinations and insert actions have clear lanes |
| Switching tabs retains the previous section's scroll position | Section/step/route navigation starts at the top of its own inspector scroller | Newly opened headings stay visible; typing does not reset scroll |
| Knowledge warnings concatenate raw YAML paths and messages | One labelled, clickable issue row per affected step | Users can identify and open the actual step without decoding a path |
| Local setup command is embedded in prose | Compact setup disclosure and wrapping code block containing one valid shell line | Easier reading and copying without a broken multiline command |
| Required information uses unspaced native-looking checkbox rows | Styled native inputs, consistent row height, and mapped-input guidance | Keeps checkbox semantics and keyboard support; already-required mapped inputs stay protected, while incomplete imported mappings can still be repaired |
| Delete connection footer is flush against the inspector edge | Consistent 24px inset and separated explanatory text | Aligns the destructive action with the rest of the form |
| Status reads “Draft · Invalid draft” | One status phrase from the existing document state | Removes repetition without changing validation |
| Grouped result menus render behind graph nodes | Anchored portal above the graph with collision handling, Escape and focus return | Menu items stay clickable at desktop and compact widths |
| Hidden insert control shifts the connector label off its anchor | Insert control is positioned outside the label's measured width | Label centres on the actual connection; insert remains keyboard reachable |
| Toolbar combines unaligned text and a native disclosure triangle | Consistent ghost controls, icons and custom view chevron | Distinguishes actions and aligns their baselines |

The obsolete in-canvas bundle-menu styles were removed with their replaced component. No result count is hard-coded: the current fixture groups four recovery outcomes, while other workflows may group different counts.

Verification: focused browser regressions cover scroll restoration, card insets, warning rows/navigation, nonduplicated status, popup layering and keyboard focus, label geometry, checkbox recovery, footer layout and literal command text. Actual screenshots were inspected at 1440px and 1024px. At code head `bcf29fd`:

- Frontend unit tests: **159 passed**.
- Production TypeScript/Vite build: **passed**.
- Full sequential Playwright suite: **79 passed**, including all seven new regressions.
- `git diff --check`: **passed**.
- Local Studio and backend health endpoints: **HTTP 200**.

Screenshots from the full browser run were inspected for the 1024px result menu, populated Knowledge warning/help layouts and inset connection footer. Backend/runtime code was not changed; no paid-provider run was performed. No remote CI, push or deployment is implied.
