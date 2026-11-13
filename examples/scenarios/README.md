# Offline workflow scenarios

From the repository root:

```sh
uv run libretto test examples/scenarios
uv run libretto test examples/scenarios/repair-booking.scenario.yaml --json
uv run libretto test examples/scenarios --output evidence.json
```

These files use the real repair YAML/compiler/runtime, scripted evaluator proposals and simulated tool results. They never import the repair application's Python handler, open a microphone or call inference providers. No credentials are needed.

- `repair-booking`: collect details, assert no early action, acknowledge the complete readback, approve, then assert the actual result and exact tool arguments.
- `repair-correction`: change protected details and propose approval on the same turn; assert no action until a fresh readback and later approval.
- `repair-refusal`: withdraw consent and assert zero booking receipts.
- `repair-repeated`: complete two identical requests; assert independent approvals and request identities.
- `repair-interrupted`: mark the readback partially delivered, propose approval, then assert zero actions, no accepted fact and the runtime's withheld-confirmation reason.

To see a useful failure, copy a scenario and change its final `action_count` expectation. Run it again: the command exits 1 and reports the checkpoint, expected count and actual count. Restore the correct expectation to pass. Changing only expected values does not fix a faulty workflow; test YAML changes against the intended contract.

The full [author guide](../../docs/testing.md#offline-scenario-files) explains supported steps, assertions and limitations. These are runtime-contract tests, not voice acceptance or language-understanding evaluations.

All examples designate `address` as sensitive: assertions still check the original value, while reports and saved evidence redact it. Open `evidence.json` through Studio's **Test & debug → Open saved test**. No connection or API keys are required for replay. To enable **Show step in workflow**, first open the exact repair YAML used by the scenario.
