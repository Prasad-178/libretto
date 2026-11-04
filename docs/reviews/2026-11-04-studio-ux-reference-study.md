# Studio UX reference study — November 4, 2026

Status: research and proposed designs for discussion. Application behavior has not changed in this pass. This is a bounded Studio usability proposal, not a change to the OSS product direction or a replacement for runtime milestone acceptance.

## Review in Paper

[Studio — UX v3 / November review](https://app.paper.design/file/01M6A0TRXN4CJ9WFK05YH6CX0W/p-5-0)

Eleven 1440 × 900 screens use a fictional repair-visit workflow so the design remains independent of Northline:

1. Agent: readable shared instructions, expandable editor, first message and model/voice summary.
2. Model picker: searchable provider groups, current selection, custom ID path and OpenRouter input/output prices.
3. Knowledge: library and document preview remain readable when unrelated workflow issues prevent testing.
4. Models & voice: separate response/evaluator roles, speech engine and token-based custom vocabulary.
5. Workflow: connected branches, visible outcomes, stationary selection and a right-hand prompt inspector.
6. Tools: application-owned Python functions, inputs, outcomes and action-step references.
7. Collected data: plain-language field descriptions, types and references before potentially breaking changes.
8. Test & debug: current step, conversation, collected values and an explanation/recovery path for an interrupted readback.
9. Edit connection: selected connector highlighted in place, destination, display label, and language/state execution rule in the existing inspector.
10. Workflow issues: contextual validation messages, source paths and links to the relevant step/connection; knowledge remains visible behind the drawer.
11. Reasoning effort: open select with an explicit Default option and explanatory copy. The Models & voice screen also shows this control closed.

These are static design states. Example events, files and conversation values are illustrative; they are not observed test results. Added controls require implementation and acceptance checks before being described as available.

## Findings behind the screenshots

| Problem | Evidence in current source | Proposed treatment |
| --- | --- | --- |
| Sources appears empty when an action lacks an unknown-outcome route | `SourcesPage.tsx` clears its manifest while fetching; the API compiles the entire workflow; a failed manifest renders as zero collections | Distinguish loading, true empty and failed states. Show contextual workflow issues with links to the action. Keep an explicitly identified last-valid manifest, or safely parse knowledge configuration independently, without bypassing project-root checks. Pause retrieval/testing where required; never imply stale data matches a new draft. |
| Shared instructions renders as a narrow native textarea | Its standalone textarea misses the label-child CSS applied to other Settings editors | A shared editor component with full width, explicit typography, useful minimum height and expanded editing. Preserve undo grouping and source fidelity. |
| Model picker contains only one model | `/api/studio/capabilities` returns configured speaker/evaluator choices, often identical | Fetch the OpenRouter catalog independently of the current selection. Keep current/custom IDs available through catalog failures. |
| Chrome tab lacks a logo | The server's generated Studio HTML has no favicon link although Vite's HTML does | Stable Libretto favicon resources referenced by every HTML entrypoint, with suitable SVG and raster fallbacks. Verify served HTML and browser tab. |
| Recognition hints is a large line-list textarea | Existing control exposes raw serialization rather than term editing | Removable vocabulary chips; Enter adds a term; multiline paste adds several; duplicates/empty terms handled explicitly; keyboard focus/removal and overflow remain usable. |
| Dropdown chevrons sit below the visual center | Text glyphs inherit font metrics | One shared SVG chevron slot, centered by layout, independent of label line-height; verify short, tall and multiline controls. |

An unknown action outcome remains a required safety branch. Improving the Sources error presentation must not silently add, remove or ignore executable routes.

## Reference coverage and limits

The open ElevenAgents agent screen and LLM drawer/model picker were read directly. Its sidebar exposed Agent, Knowledge Base, Analysis, Tools, Procedures, Workflow, Channels, Conversations and Agent settings. Navigation automation was unreliable: T3 returned `Preview automation snapshot timed out after 15000ms.` twice. Native accessibility could read the agent and model screens, but did not reliably navigate the other pages. Those pages were studied through official documentation; this is not a claim that every live screen was inspected.

Follow-up observation on November 4: native accessibility navigation succeeded by focusing a sidebar link and pressing Return. Workflow, Knowledge Base, Analysis and Tools were then read directly in the existing Chrome tab. Workflow exposed named edges, prompt previews, Add connection, explicit zoom/Fit/Rearrange and Inspector controls. Knowledge showed a true empty state with search, source/retrieval tabs and add-document action. Analysis separated evaluation criteria from transcript extraction; this is post-call analysis, unlike Libretto's runtime collected fields. Tools showed system-tool controls, search and an explicit unknown-tool entry. The reference connection button did not open reliably; connection-form details continue to use official documentation plus Libretto's existing RouteInspector. No reference configuration was intentionally edited, no test was started and no agent was published. The T3 reference tab itself is signed out; it is distinct from the authenticated native Chrome tab.

Useful references:

- [ElevenAgents overview](https://elevenlabs.io/docs/eleven-agents/overview): progressive configuration and a focused agent screen.
- [Workflows](https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows): connected graph, concise step previews, distinct transition labels and contextual inspectors.
- [Knowledge base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base): searchable library, document detail and usage context.
- [Tools](https://elevenlabs.io/docs/eleven-agents/customization/tools): explain what a tool does and what it accepts. Libretto's tool implementation remains Python application code.
- [Procedures](https://elevenlabs.io/docs/eleven-agents/customization/procedures): clear task-specific instructions. Do not introduce a second workflow authority.
- [Agent analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis): understandable extraction definitions and outcomes; borrow these for local debugging.
- [Versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning): clear snapshot identity; Libretto uses local drafts, exports and Git rather than hosted release management.
- [Realtime monitoring](https://elevenlabs.io/docs/eleven-agents/guides/realtime-monitoring): current execution context; use the idea for deliberate local tests, not a production fleet dashboard.

Do not copy ElevenLabs' prices or latency claims. Do not import its accounts, billing, traffic splitting, hosted conversations, managed channels or other platform surfaces. Do not add settings that Libretto cannot execute, including per-node model overrides, arbitrary tool builders or unused interruption switches.

## Navigation proposal

Use one stable left navigation: **Agent, Workflow, Knowledge, Tools, Collected data, Test & debug**. Keep **YAML** and **Connection** available below. Models & voice is a focused Agent subpage/drawer.

The graph inspector owns prompt and connection editing. The route index remains a secondary workflow utility, useful for auditing many transitions; it does not need a primary navigation tab. Selecting a node should open its inspector without recentering the canvas. Explicit Find/Fit commands may navigate.

Separate Tools and Collected data rather than retaining the unexplained “Fields & tools” heading. Human-readable labels may be derived from IDs; do not invent executable schema fields to store decorative names. IDs and YAML details remain available under Advanced. A reference-sensitive type change must give actionable guidance instead of silently invalidating predicates or tool arguments.

## OpenRouter catalog and pricing

Source of truth: [OpenRouter model catalog API](https://openrouter.ai/api/v1/models). The Paper prices are a snapshot checked November 4, 2026, not permanently embedded application prices.

- Retrieve catalog metadata without requiring a paid inference call. Bound fetch duration and cache age; display last-updated/stale state. Preserve current and custom model IDs during failure.
- Show friendly names, provider marks and exact IDs in a searchable picker. Popular is a curated view over the fetched catalog, not a separate handwritten pricing table.
- Support the popular families observed in ElevenAgents when present in OpenRouter: OpenAI, Anthropic, Google, DeepSeek, Z.ai, Qwen and Nvidia; include other suitable text families from the catalog. Do not advertise unavailable IDs.
- Response and evaluator remain distinct choices. Filter by supported input/output/endpoint capabilities; evaluator structured-output support needs explicit handling and validation. Catalog listing alone does not prove practical compatibility or voice quality.
- OpenRouter prompt/completion prices are per token: convert to **USD per 1M input/output tokens** for display. Handle absent prices, free models, context tiers and applicable overrides honestly. Show model-specific details where a single base price is insufficient.
- Do not invent response latency, speed rankings or a total per-minute cost. Do not imply STT/TTS costs are included in these LLM token prices.

## Logos and shared controls

Use [Lobe Icons](https://github.com/lobehub/lobe-icons) for actual AI provider/model logos. The Paper model picker already uses its Google, Anthropic, OpenAI, DeepSeek and Z.ai assets, and the Agent summary includes its LiveKit mark. Use provider branding consistently in the picker and selected-value controls. Keep logos in a fixed-size slot with the name always visible.

For implementation, prefer a pinned static-SVG package or individually bundled assets from the library over fetching `latest` icons at runtime. This avoids a new provider network dependency for an OSS editor and avoids pulling a whole UI framework solely for logos. Verify license/attribution and brand variants for the chosen assets. Use official assets for a provider absent from the library; an unknown custom provider should have a clearly neutral fallback, never a fabricated brand logo.

Use one shared select/combobox design with a fixed 16px SVG chevron, a fixed trailing slot, `align-items: center`, and no baseline-aligned text arrows. Center against the whole trigger for multiline values. Cover compact, standard, disabled, error, open and keyboard-focus states; keep popup sizing, scroll and search usable at 1024/1280/1440 widths.

## Speech capability honesty

Name the two supported paths **LiveKit** and **Direct Deepgram**. Both are supported choices. Never describe Direct Deepgram as “legacy.” This owner preference also applies to future product copy and documentation.

Direct Deepgram passes recognition terms as keyterms. The current LiveKit adapter does not pass custom vocabulary or patient tuning. On that engine, preserve the YAML values but mark these controls inactive with an explanation. A control must not look effective when the adapter ignores it. Switching engines must not silently discard configuration or credentials. Credentials remain ephemeral and outside YAML, drafts, sidecars and traces.

## Explicit Default reasoning choice

Prasad requested Default as an option, rather than forcing an explicit effort level. It means the request leaves `reasoning.effort` unset so the model/provider selects its behavior; it must not map silently to minimal, low or disabled reasoning. Other existing reasoning options, including suppression of reasoning content in user-visible output, remain independent.

Current code is not ready for this UI value: `Models.reasoning` accepts minimal/low/medium/high with an omitted-value default of minimal, and the response adapter always sends that effort. Implementation needs an explicit default representation across schema, YAML edits, frontend and request serialization. Preserve existing explicit values and the behavior of older omitted settings unless a separately documented compatibility migration changes it. Selecting Default must round-trip distinctly and omit the effort field at the provider boundary. Test with captured requests, without paid inference.

The menu illustrates the current explicit levels plus Default. Actual enabled levels need model-specific capability evidence; catalog support for a generic reasoning parameter does not establish support for every effort value. Unknown custom models need a clear capability fallback. Do not add temperature, backup-model routing, reasoning summaries, per-node overrides or other ElevenLabs controls as part of this request. [OpenRouter reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) is the implementation reference.

## Scope restraint for this iteration

Prasad explicitly asked to avoid unnecessary features. The three follow-up states refine existing routing, validation and reasoning controls. A proposed extra test-setup screen was dropped: use the existing Connection/Test controls. Do not add another setup wizard, platform page, general automation engine or competitor feature checklist. More detailed visual states do not authorize implementation of new runtime capabilities.

Interaction review: the selected connector and its label share the cobalt highlight; editing does not move the graph. Display labels are explicitly separate from conditions. Validation links target the offending action/connection and do not auto-generate safety branches. Deleting a required outcome must retain existing validation/reference protections. The issues drawer is dismissible, preserves the library context and distinguishes an unfinished draft from a runnable workflow. Existing YAML/undo behavior must survive these presentation changes.

## Suggested implementation order

1. **Fix concrete blockers:** Sources error/empty distinction and contextual issues; shared prompt styling; shared dropdown alignment; favicon entrypoint parity. Verify each reported screenshot case in the actual browser.
2. **Model selection:** small catalog/cache API boundary, provider logos, searchable response/evaluator controls, fresh/stale/error states and custom-ID preservation. Test price conversion and capability behavior without inference.
3. **Configuration organization:** Agent subpage, speech/vocabulary states, separate Tools/Collected data and a consistent navigation shell. Preserve YAML, references, undo grouping and test snapshots.
4. **Workflow authoring:** readable connected graph, stationary selection, prompt inspector, explicit connection editing, Arrange/drag behavior using presentation metadata. Verify generic graphs and keyboard alternatives.
5. **Debug explanations:** derive human-readable blocked reasons from runtime events, retaining raw evidence. Trace export and richer reason codes may need M3 runtime work; do not fake reasons in the UI or silently expand this design pass into a scenario-runner implementation.

Before implementation, settle the navigation and these screen states with Prasad, then write a focused implementation plan with dependencies and acceptance checks. The current pass does not authorize a new hosted product, another runtime or broad feature expansion.
