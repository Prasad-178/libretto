# Studio visual contract and YAML coverage

Status: design requirements, not implemented behavior. Read with the [reference study](2026-11-04-studio-ux-reference-study.md) and [Paper page](https://app.paper.design/file/01M6A0TRXN4CJ9WFK05YH6CX0W/p-5-0).

## Ownership of visible elements

| Element | Source | Editing behavior |
| --- | --- | --- |
| Workflow title | `Workflow.name` | Header rename / Conversation / Workflow settings. Filename is document state, not an invented workspace. |
| Card title | `nodes[id].title`, falling back to node ID | Title edits update YAML; ID changes update references atomically. |
| Card icon/type | `nodes[id].kind` | Conversation, Action, Say or End. Conversion validates compatible settings. |
| Card preview | Prompt, exact Say text, or action tool ID | Derived from the same source edited in the inspector. |
| Synthetic Start | `Workflow.start` | Start-step selector or start connection; not an extra executable node. |
| Connector endpoints | Source node and `edges[].to` | Update destination; never create a second graph model. |
| Connector label | `edges[].label`, otherwise result/condition summary | A display label does not replace the execution rule. |
| Tool-result binding | `edges[].result` | Select a declared Python-tool result in screen 19. Destination and label remain separately editable. |
| Available result IDs | Python `ToolDefinition.results` / runtime manifest | Read-only contract in Studio. A new result requires application-code support. `failed` and `unknown` are mandatory recovery results in the current compiler. |
| Allowed tools/typed arguments | Registered manifest plus YAML tool allowlist | Selection is limited to registered capabilities; mappings use compatible fields. |
| Layout/viewport | Computed layout, editor state and `.studio.json` | Presentation only; dragging, selection and zoom never change execution. |
| Validation status | Current revision's compiler result | A last-valid graph never implies a current invalid draft can run. |
| Active step / receipts / blocked reason | Runtime events for the captured test snapshot | No invented success state, model-inferred execution colour or editable receipt. |
| Model names/prices/defaults | Provider catalog metadata | Friendly labels and prices are display metadata; stable model ID is serialized. Missing metadata is explicit. |

## Deterministic colour rules

- **Cobalt:** selected node/route, focused control or active navigation. Derived from editor selection, never written into executable YAML.
- **Neutral:** ordinary route definitions and arbitrary application result IDs. `booked`, `captured`, or a custom name do not become green by string matching. The prototype's earlier green booking branch has been made neutral.
- **Amber:** the reserved `unknown` recovery result, validation warnings or incomplete-delivery notices. The text/icon distinguishes these contexts; colour alone is insufficient.
- **Red:** actual validation/provider/runtime errors. A configured route is not evidence an error occurred.
- **Green:** an explicit verified status such as a current valid definition. It must not imply an arbitrary tool result means business success.

Do not add a colour property to executable YAML. Do not generate a palette by hashing IDs or asking an LLM to classify outcomes. The definition view and test overlay have separate, labelled meanings. A small definition legend is shown on screen 05. No custom-colour feature is introduced.

## Field coverage

[`studio-visual-bindings.json`](studio-visual-bindings.json) maps every annotated field in the current `schema.py` models to a structured control/location. Grouped fields (`nodes`, `speech`, predicates, etc.) expand into their referenced model entries. Dictionary keys and collection management also require add/rename/remove paths with reference validation.

The registry is a requirement inventory, not proof that all controls are implemented or every variant has a dedicated screenshot. Entries labelled **specified** reuse a control pattern but are not separately drawn. Important remaining variants include allowed choices, recursive/typed predicates, route ID/timing/order, editable required facts, credential-source selection and policy add/rename/remove. Screen 21 closes the previously absent request/confirmation configuration; screen 22 closes the advanced node-settings gap. These variants are implementation acceptance items, not permission to omit them or fall back exclusively to raw YAML.

Only schema-supported edits need to be offered. Invalid values, unsupported schema versions or arbitrary Python behavior are not extra visual features. Preserve valid unused properties through kind changes; expose them in an Advanced retained-values form with an explicit “not used for this kind/provider” explanation, rather than silently deleting them or implying they affect execution. Identifier changes and edits to referenced types/requests/policies must update compatible references atomically or block with navigation to the affected usage.

The current schema does not yet contain TTS pronunciation rows or the full new reasoning-default/effort range. Those are explicitly approved schema/adapter additions and must be tracked separately from current-field coverage. Pronunciation rows require a named typed schema before implementation; do not hide executable behavior in the Studio sidecar. Credentials remain outside YAML.

## Scroll contract

The Studio shell and Speech header remain fixed to the viewport. STT and TTS are sibling panes with bounded heights and `min-height: 0`. The TTS pane owns vertical overflow, `overscroll-behavior: contain` and stable scrollbar space. Wheel/touch scrolling over it changes only that pane, including when it reaches either end; the page and STT pane stay still. Focused pronunciation inputs remain reachable by keyboard. Other panes may own their own overflow independently. The drawn scrollbar is a static design indicator, not browser-behavior evidence.

Implementation acceptance: use enough pronunciation rows to overflow, scroll TTS through both boundaries, and assert root/STT scroll positions do not change. Repeat with keyboard, zoom and a smaller viewport. Do not claim this behavior verified from Paper alone.

## Voice discovery

Use a provider/connection-aware catalog boundary, not one hardcoded voice list for every engine. [Cartesia's paginated List Voices API](https://docs.cartesia.ai/api-reference/voices/list) supports provider-authenticated discovery. Cache/paginate the complete accessible result set, support search/language filtering, preserve the selected ID and display freshness/errors. Use session credentials only for the corresponding authenticated provider; do not share an account-specific cached catalog across sessions.

[LiveKit Inference's Cartesia integration](https://docs.livekit.io/agents/models/tts/cartesia/) supports default Cartesia voices but excludes pre-existing custom/community voices available through the direct provider plugin. Do not offer incompatible voices or require a Cartesia key merely to browse a LiveKit-compatible suggestion list. A universal LiveKit voice-list API has not been established in this research. Until a supported discovery route is verified, label the cached/suggested subset honestly and retain an editable custom voice-ID path, validated against the selected route. Do not promise “all provider voices” for an integration that cannot serve them.

Screen 20 illustrates compatible suggestions using names from the official LiveKit guide; it is not a live API fetch or an exhaustive roster. Metadata discovery is distinct from speech synthesis. No cloning, paid automatic previews, hosted voice storage or new provider matrix is introduced. If a voice-list request fails, preserve the current voice and custom ID; never silently switch it.

## Implementation acceptance

All forms edit the same source-preserving document transaction/history model as YAML. Test both directions: form edit → exported YAML → backend parse, and YAML edit → corresponding form. Cover every binding, including null/optional values, collection operations, reference-safe renames and disabled capability states. Derived labels/colours must follow IDs/state rather than become another executable configuration.

The schema coverage inventory can be checked read-only by extracting annotated class fields with Python's AST and comparing their names to the JSON keys. This verifies inventory completeness only; it does not establish working visual parity. No application code changed in this pass.
