# M1 follow-up correctness and maintainability review

Reviewed the merged M1 on main (`b68df8b`) before starting M2. This was an author review with deterministic reproductions, not a new independent review or live-provider acceptance test.

## Gaps fixed

1. **CLI schema errors escaped the diagnostic formatter.** Validation loaded the workflow before entering the compiler's error handler. It now compiles once and uses that returned definition, so malformed configuration produces path/code/message diagnostics and exit status 1. The regression failed with an uncaught ValidationError before the fix.
2. **A full output queue prevented event-stream termination.** Close could not enqueue its end marker when all 600 slots were occupied. Session now explicitly records when its producers have finished; consumers drain every queued event and terminate without requiring a spare slot or discarding events. The regression timed out before the fix.
3. **Tool declarations admitted invalid scalar values.** Frozen dataclasses alone did not enforce a boolean `required` flag or nonempty string outcome statuses. Six invalid-input regressions failed before explicit validation was added. Valid signatures and manifest shapes are unchanged.

## Structure and readability

- Session owns idempotent startup and all initial-node entry behavior. WorkflowRunner delegates instead of editing several private transition fields.
- Compiler orchestration, tool-contract checking and source indexing are named functions with distinct responsibilities.
- `project_paths.resolve_source_directory` owns project-root, traversal and symlink containment checks shared by compilation and Studio inspection. Hosted bundled-source restrictions remain in StudioWorkspace; they are a separate application policy.
- Tool registry methods have explicit argument/return annotations and document the legacy internal dispatch form. Application handlers still receive ActionContext.
- M1 modules and lifecycle tests use consistent formatting, replacing compressed multi-statement layouts. No new dependencies, alternative runtime, policy builder or framework was introduced.

## Verification and scope

Ruff passed; 215 backend tests passed, including the outside-checkout core wheel test, all prior delivery/cancellation regressions and the new failures above. Frontend114, browser25, production build and retrieval8 passed. No paid inference or outbound business actions were performed. Source containment and public startup tests bracketed the refactor.

The older M1 report's deferred CLI diagnostic finding is now resolved. This review does not establish bug-free code, live acoustic/semantic quality, or durable exactly-once actions. Existing process/session limits, application-owned callback state and the repository license decision remain documented limits. M2 has not started.
