# Migrating to explicit request and confirmation policies

[Library guide](../library.md) · [Northline YAML](../../examples/receptionist.yaml) · [Repair YAML](../../examples/repair_visit/agent.yaml)

Version 1 gains additive `requests`, `confirmations`, `evaluation_prompt` and node `begin_request`/`confirmation`. Existing simple workflows without guarded actions remain valid. Actions now compile against registered signatures and require routes for all declared outcomes, including `failed` and `unknown`.

```yaml
requests:
  visit: {fields: [address, consent, accepted]}
confirmations:
  booking:
    request: visit
    fields: [address]
    acceptance_field: accepted
    consent_field: consent
nodes:
  collect:
    kind: conversation
    begin_request: visit
    # ... collect details; route to confirm
  confirm:
    kind: conversation
    confirmation: booking
    entry: respond
    readback: "Service address {address}. Is that correct?"
    # ... route to an action only after acceptance
  book:
    kind: action
    confirmation: booking
    # ... registered tool, argument mappings, required facts and result routes
```

This is an abbreviated fragment; the linked repair example is executable. Define fields separately; acceptance and consent must be distinct request-local booleans. Protected fields and confirmed-action facts belong to that request. A readback includes every protected field. Policy declarations cannot execute Python.

`begin_request` belongs on a conversation entry point. Entering it creates a new request ID, clears only request-local facts/permissions and cancels old pending authority. Session facts remain. Ordinary collection/correction stages keep the request identity. Route correction loops to an ordinary stage; reentering the request entry intentionally starts over. Requests cannot overlap on fields. Close/end clears active authority; explicit cancellation leaves no active request until a request entry is committed again.

Northline previously relied on named recipient/message flags and a readback heuristic. Its `front_desk` scope now covers transfer-to-message fallback; `transfer_destination` and `message_details` are explicit policies. Transfer has a literal recipient readback. `message_confirmed`/`destination_confirmed` are configuration field names, not privileged runtime branches. Domain extraction instructions live in `evaluation_prompt`, capped at 5,000 characters.

A runtime-issued permit binds policy, request, protected values, message and generation epoch. Complete delivery makes it eligible for a subsequent approval turn. Correcting details and approving them in one turn cannot authorize those changed details. Corrections, refusal, withdrawn consent, interrupted delivery, cancellation and new requests invalidate permission. Punctuation has no authority.

Move old imports of `ToolRegistry(directory)` to explicit demo composition (`DemoToolRegistry`) or register your own frozen `ToolDefinition` and async handler with the empty `ToolRegistry`. The old internal demo adapter remains for compatibility, but the supported handler takes arguments plus `ActionContext`, not mutable session state. Handle actual `failed`/`unknown` results with honest recovery and no automatic uncertain retry.
