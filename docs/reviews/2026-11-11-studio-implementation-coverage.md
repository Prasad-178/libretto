# Studio UX implementation coverage

Status: implementation started 2026-11-11. A listed design control is not verified behavior.

| Binding | Design control | Task | Status / evidence |
| --- | --- | --- | --- |
| `FieldSpec.type` | 07 Collected data > Type; reference-aware type change | 2 | Planned |
| `FieldSpec.description` | 07 Collected data > What should the agent collect? | 2 | Planned |
| `FieldSpec.choices` | 07 Collected data > Advanced > Allowed choices token input; specified control | 2 | Planned |
| `Predicate.op` | 13 State check > Check type / All / Any / Not | 2 | Planned |
| `Predicate.field` | 13 State check > Collected field selector | 2 | Planned |
| `Predicate.value` | 13 State check > Expected value; typed text/boolean control; specified variant | 2 | Planned |
| `Predicate.conditions` | 13 State check > Nested checks; Add/Remove; recursive specified variant | 2 | Planned |
| `Edge.label` | 09/19 Connection > Canvas label | 5 | Planned |
| `Edge.id` | 09/19 Connection > Advanced > Route ID; reference-safe rename; specified control | 5 | Planned |
| `Edge.to` | 09/19 Connection > Go to | 5 | Planned |
| `Edge.condition` | 09 Connection > Language condition | 5 | Planned |
| `Edge.predicate` | 13 Connection > State check | 5 | Planned |
| `Edge.result` | 19 Outcome route > When the tool returns; registered result selector | 5 | Planned |
| `Edge.timing` | 09/19 Connection > Advanced > Transition timing; enum select; specified control | 5 | Planned |
| `RequestSpec.fields` | 21 Advanced > Task memory / 23 Task settings > Fields kept for this task; typed multiselect | 2 | Planned |
| `ConfirmationSpec.request` | 23 Confirmation > Advanced > Task/request binding | 2 | Planned |
| `ConfirmationSpec.fields` | 23 Confirmation > Which details must the caller confirm? | 2 | Planned |
| `ConfirmationSpec.acceptance_field` | 23 Confirmation > Advanced > Approval boolean field | 2 | Planned |
| `ConfirmationSpec.consent_field` | 23 Confirmation > Advanced > Optional consent boolean field | 2 | Planned |
| `ConfirmationSpec.require_delivery` | 23 Confirmation > Wait until the full message has played | 2 | Planned |
| `Node.begin_request` | 22 More options > Start a new task here; request selector; specified advanced control | 2 | Planned |
| `Node.confirmation` | 22 Linked confirmation rule / 23 Rule editor; stable policy binding in Advanced | 2 | Planned |
| `Node.kind` | 22 More options > Step kind; validated conversion; specified advanced control | 2 | Planned |
| `Node.title` | 22 Step name; graph card heading | 2 | Planned |
| `Node.prompt` | 05 Step inspector > Prompt; expanded editor | 2 | Planned |
| `Node.text` | 22 Step settings > Exact message for Say kind; specified kind variant | 2 | Planned |
| `Node.readback` | 22 Read these details back; friendly tokens map to stable field placeholders | 2 | Planned |
| `Node.tools` | 22 More options > Available tools in this step; typed multiselect | 2 | Planned |
| `Node.knowledge` | 22 More options > Step knowledge; typed multiselect | 6 | Planned |
| `Node.tool` | 14 Action > Registered Python tool | 5 | Planned |
| `Node.requires` | 14 Action > Before this action can run > Required fields multiselect; specified editable variant | 5 | Planned |
| `Node.arguments` | 14 Action > Inputs; typed field mappings | 5 | Planned |
| `Node.edges` | 05/09/13/19 Connections; Add/Edit/Remove; ordered routing rules | 2 | Planned |
| `Node.patient` | 22 More options > Patient turn handling; capability explanation when ineffective | 2 | Planned |
| `Node.entry` | 22 When this step starts > Wait for caller / Speak first; readback steps require Speak first | 2 | Planned |
| `Models.speaker` | 11 Conversation > Response model | 3 | Planned |
| `Models.evaluator` | 18 Stage controller > Controller model | 3 | Planned |
| `Models.reasoning` | 11 Conversation > Reasoning slider; default/max/etc require schema extension | 3 | Planned |
| `SpeechEndpoint.voice` | 04/20 TTS > Voice picker or custom voice ID; unused STT voice preserved in Advanced endpoint fields | 4 | Planned |
| `SpeechEndpoint.provider` | 04 STT/TTS model picker > Provider; affects credential/capability options | 4 | Planned |
| `SpeechEndpoint.model` | 04 STT/TTS model picker > Model; unknown IDs editable through custom ID fallback | 4 | Planned |
| `Speech.engine` | 04 Speech > Voice integration: LiveKit / Direct Deepgram | 4 | Planned |
| `Speech.credential_mode` | 15 Connection > Credential source: Inference / Provider keys; specified selector variant | 4 | Planned |
| `Speech.stt` | 04 Speech > Speech recognition section | 4 | Planned |
| `Speech.tts` | 04 Speech > Voice output section | 4 | Planned |
| `Speech.hints` | 04 Speech > Recognition vocabulary | 4 | Planned |
| `Workflow.version` | 21 Advanced > Schema version; supported versions only | 2 | Planned |
| `Workflow.id` | 21 Advanced > Workflow ID; reference-safe changes | 2 | Planned |
| `Workflow.name` | 01 Agent name / header rename / 21 Workflow settings > Name | 2 | Planned |
| `Workflow.description` | 21 What does it help with? | 2 | Planned |
| `Workflow.start` | 21 Conversation starts at; synthetic Start connector | 2 | Planned |
| `Workflow.shared_prompt` | 01/12 Conversation > Instructions | 2 | Planned |
| `Workflow.welcome` | 01 Conversation > First message | 2 | Planned |
| `Workflow.fields` | 07 Collected data; Add/Edit/Remove; reference-aware field ID rename | 2 | Planned |
| `Workflow.tools` | 21 Advanced > Available registered tools; multiselect | 2 | Planned |
| `Workflow.knowledge` | 03 Knowledge > Collection definitions; local path/ID editor uses existing collection form pattern | 6 | Planned |
| `Workflow.common_knowledge` | 21 Advanced > Shared knowledge; multiselect | 6 | Planned |
| `Workflow.models` | 11 Conversation + 18 Stage controller | 2 | Planned |
| `Workflow.speech` | 04 Speech + 15 Connection configuration; credentials themselves are outside YAML | 2 | Planned |
| `Workflow.nodes` | 05 Workflow > Add/Remove/Convert steps; 22 Step settings; reference-aware node ID rename | 2 | Planned |
| `Workflow.requests` | 21 Advanced > Task memory / 23 Task settings; add/rename/remove with reference validation | 2 | Planned |
| `Workflow.confirmations` | 21 Before actions run > Edit rule / 23 Confirmation; IDs and shared bindings in Advanced | 2 | Planned |
| `Workflow.evaluation_prompt` | 18 Stage controller > Controller instructions | 3 | Planned |
| `Models.reasoning: default` and expanded efforts | 11 Compact slider / reset | 3 | Planned: compatibility + request serialization |
| `Speech.pronunciations` | 04 Word → Say as | 4 | Planned: schema + synthesis-only transformation |

## Cross-cutting acceptance

- All collection add/rename/remove operations and reference updates.
- Form → export → backend parse and YAML → form for every binding.
- Shared policies, route ordering, nested typed predicates, inactive retained values.
- Actual rendered/keyboard/scroll evidence, including error/empty/loading states.
- No inference or credentials required by deterministic checks.
