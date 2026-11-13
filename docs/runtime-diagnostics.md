# Runtime diagnostic reference

Libretto emits these explanations after its runtime has rejected progression or observed a failure. They do not create a second execution authority, infer decisions from generated text, or relax confirmation checks.

## Action vetoes

`action_blocked` includes `node`, incoming `source`/`edge`, `policy` when configured, current `request_id`, a `code`, a human-readable `reason`, and `missing_fields`. IDs identify configuration; actual fact values and fingerprints are omitted. `missing_fields` can include a boolean flag whose required true value is absent, not only an undeclared value.

| Code | Meaning |
| --- | --- |
| `missing_facts` | Ordinary required fields are absent or empty. |
| `missing_consent` | Configured request consent is absent or not true. Restore consent before seeking approval. |
| `missing_acceptance` | The current complete readback has not been approved on a later turn. |
| `missing_request` | No active request exists for the guarded action. |
| `request_mismatch` | The request name or permit request identity does not match. |
| `missing_readback` | There is no current permit/readback for this request. |
| `undelivered_readback` | The current readback was not fully delivered. |
| `stale_confirmation` | The permitted fingerprint differs from the current protected details. |
| `confirmation_required` | Generic compatibility fallback for a veto not classified above. |
| `action_arguments_changed` | An already dispatched action's arguments changed; start a new request. |

The runtime's existing prerequisite and permit guards still decide whether to execute. Diagnostics explain the first relevant failed prerequisite. A false consent flag takes precedence over asking for another acceptance when ordinary facts are complete.

## Other observed decisions

- `confirmation_withheld` retains existing acceptance codes such as `missing_readback`, `readback_not_heard_before_turn`, `changed_details`, `stale_request` and `undelivered_readback`, with step/policy/request references.
- `readback_blocked` reports `missing_readback_facts` with field IDs, or `readback_too_long`. It identifies the readback step and configured policy.
- `evaluation_error` retains `invalid_evidence`, `unconfigured_fact`, `invalid_fact_value` or `evaluation_failed`, and identifies the attempted step/request. Existing state is retained.
- Generation errors identify the response step/request. `unhandled_tool_result` identifies the action/rule when no recovery branch is available.
- A `tool_result` with status `unknown` carries `action_outcome_unknown`, the action node and policy. This means an action may already have had an external effect. Check the external system before retrying. Libretto does not retry it automatically.

Codes supplement existing event types. Consumers should tolerate unfamiliar codes and preserve the original event. An unknown outcome is not a pre-dispatch veto and must not be described as proof that nothing happened.

## Studio navigation

Live State/Trace and saved scenario evidence show codes and missing-field labels. Incoming route references open the exact connection inspector. Policy references open the existing staged confirmation-rule editor directly. Save/Cancel/Undo keep their normal behavior. During a live test, connections are inspectable read-only and rule editing requires Stop.

Links require existing IDs in the inspected workflow. Saved navigation requires an exact source hash; live navigation requires the editor source to remain the source that was tested. A mismatch preserves readable evidence and disables misleading links. Late results from a cancelled request remain inspectable in Trace without clearing or replacing the current request's notice.
