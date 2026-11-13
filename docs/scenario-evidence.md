# Saved scenario evidence

Run an offline test and save its evidence:

```sh
uv run libretto test examples/scenarios --output evidence.json
```

Open Studio, select **Test & debug → Open saved test**, and open the JSON file. The viewer labels every run **Replay · saved scripted test**. Choose a scenario, walk its events with Previous/Next or the event list, inspect collected data at that point, and examine failed checks, final simulated actions and provenance. An import does not start a session, open a microphone, invoke providers or execute tools. During an active test, Stop before opening saved evidence.

The viewer stays separate from live state. It does not replace the document or overwrite its YAML. If the exact open source matches the saved SHA-256, **Show step in workflow** can navigate to the corresponding step. A mismatch leaves the evidence readable but disables that navigation; open the YAML used for the run to enable it. Loading a different scenario resets the event position. Unsupported/malformed files produce a recoverable error. Imports are limited to 5 MB, 100 runs, 5,000 events per run and bounded nested data.

## Version 1 format

The outer object has `format: "libretto.scenario-evidence"`, `version: 1`, and `runs`. Each run contains the ordinary scenario summary plus:

- `context`: workflow SHA-256, ID/start step and YAML schema version; installed Libretto version; source commit and dirty status when a local checkout is available; model/speech configuration; `mode: "scripted"`; designated redacted field IDs.
- `timeline`: semantic events with sequence numbers, generation epochs and projected details. It includes transitions, collected state, readback identity, withheld confirmations, action starts/results, retrieved passage identities, errors and completion/interruption events.

Requests use stable per-run labels such as `request-1`, not random session IDs. A commit with `source_dirty: true` identifies the checkout base, not a reproducible clean build. Outside a checkout, commit/dirty metadata can be null. Workflow hashing preserves source newlines, including CRLF. The file does not embed the source, so keep the workflow alongside your evidence if you need it later. Runtime/model/tool behavior still depends on the checked-out version and scenario configuration; a hash is not a complete execution environment.

Raw prompts, YAML, utterances, generated text, audio, fact evidence strings, retrieved passage text, provider credentials, arbitrary tool-result data and raw timing values are omitted. Epoch/sequence values describe event order, not audio timestamps. The **Original projected event** section retains the saved event exactly; it is deliberately not the full raw runtime packet. Existing live Trace remains available for the live test.

## Redaction

Declare workflow field IDs in the scenario:

```yaml
sensitive_fields: [address, customer_name]
```

Unknown IDs fail setup to catch typos. Assertions evaluate original values first. Before returning/printing/saving a report, designated facts and mapped tool arguments become `[redacted]`. Sensitive operands, including booleans, are replaced by field/argument identity before an assertion failure is formatted. Sensitive strings and their normalized/escaped variants are retained across the run for data-bearing text redaction. Fingerprints for actions with sensitive arguments are suppressed, including hashes embedded in failed fingerprint assertions: an unsalted hash can reveal a guessable value.

Redaction is conservative. The same string appearing in other data-bearing properties can be masked too, especially for short values. Raw turn-evidence text is not used as a redaction token. Executable IDs, result codes, request references, passage IDs and model/speech configuration are preserved so navigation and reproducibility stay accurate; an identifier can coincidentally contain the same text as a designated value. Field/tool/policy IDs and source hashes remain part of the diagnostic contract. Non-designated facts and arguments, scenario names and configuration may still identify an application. This is not automatic anonymization. Never put credentials into scenarios or workflow text; inspect exported evidence before sharing it. A malformed-input diagnostic reports validation paths/types without echoing rejected input values.

Exports use an atomic temporary-file replacement and are created with private temporary-file permissions. Failed assertions still produce evidence and exit 1. Invalid setup or a write failure exits 2; a pre-existing output file remains unchanged when setup fails. Input scenario/workflow files cannot be overwritten by `--output`. JSON stdout remains the CLI summary structure; the explicit output file is the versioned Studio bundle. Output to a JSON filename that does not end in `.scenario.json`, so suite discovery won't mistake it for a scenario.

## Explain a workflow failure

In your own copy of the repair workflow, change the `collect` step's `complete` predicate so it requires `consent` equal to false. Run the booking scenario against that copy and save evidence. The scenario collects consent=true but stays at `collect`; its stage check fails and there is no confirmation readback to acknowledge. Open the saved file to inspect the state and failed check.

Restore the predicate to true and rerun. The scenario now transitions to `confirm`, accepts a fully delivered readback on a later turn, and records one simulated booking. The two artifacts have different workflow hashes and event paths. An automated regression exercises this edit → fail → repair → pass sequence; it is not evidence from an external developer adoption trial.

Saved replay remains manual event inspection, with no transcript/audio playback or automatic rerun. Matching source enables exact step/connection navigation and direct entry into the staged confirmation-rule editor. Navigating does not edit YAML; Cancel preserves source. Missing-fact/consent/approval diagnostics list the relevant field IDs and route/rule references. Live editable-rule links require Stop. Real-provider language and acoustic checks remain separate from scripted evidence.

A checkpoint must contain an effective assertion: null scalar expectations or wholly empty `facts`/`absent_facts` do not qualify. Empty exact lists such as `action_results: []` are meaningful zero-result assertions. The scenario version must be an actual integer, not a boolean or float.
