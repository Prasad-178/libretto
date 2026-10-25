# Libretto

Voice workflows, written in YAML.

A planned developer tool for defining staged voice agents in YAML. A generic receptionist will be the first complete example: answer questions from documents, find a destination, simulate a transfer, recover by taking a message, and wrap up.

The initial release is English only, with configurable speech hints where supported by the active provider adapter.

The runtime will enforce the permitted graph, typed state, stage-specific capabilities, and action prerequisites. Language models will interpret callers and generate conversational responses. Deterministic execution does not imply deterministic interpretation or wording.

The project is currently in design. See the [design document](docs/superpowers/specs/2026-10-25-yaml-voice-engine-design.md) for scope, provider choices, acceptance criteria, and decisions awaiting review.

All example business information, contacts, availability, and tools will be synthetic. Credentials and session artifacts stay local and untracked.
