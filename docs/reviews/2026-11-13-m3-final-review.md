# M3 independent review and regression response

Independent read-only review: `72ec718..ee0907a`, GPT-6.1 Sol with inherited medium reasoning. The reviewer reported no Critical findings, four Important findings and two Minor findings. It did not rerun full suites or establish hosted CI. Parent work advanced main to `c3c5b74` during review; findings target the requested older head, not that subsequent correction. No reviewer writes or browser runs occurred.

## Important findings and responses

1. **Workflow controls propagated internal cancellation out of the scenario CLI.** `wait_idle()` now distinguishes cancelled runtime siblings from cancellation of its caller. Unexpected task exceptions still propagate. Regressions cover `cancel_request`, `stop_talking`, `end_call`, CLI structured success, external cancellation cleanup and unexpected runtime failure.
2. **Sensitive boolean/previous normalized values leaked in failed assertion text.** Field/argument operands are masked by identity before formatting. Normalized and escaped sensitive strings are retained across the run. Regressions cover a sensitive boolean fact and mapped boolean tool argument, earlier normalized address after replacement, sensitive fingerprints and escaped text.
3. **Settled snapshots lost intermediate requests and could pass a wrong count.** Parent correction `c3c5b74` synchronizes event consumption and records all observed state identities before checkpoints. The fix pass additionally exercises the reviewer's three-request progression and verifies that count 2 fails and count 3 passes. Startup-complete action/non-action cases also retain `request-1`.
4. **Redaction rewrote tool/policy IDs and broke navigation.** Redaction now targets data-bearing properties; executable IDs, request references, passage IDs and model/speech configuration stay intact. Turn-evidence prose is not a redaction token. A collision case with sensitive address `book` and sensitive boolean consent preserves `book_visit`, `booking` and `book`, while hiding the address/boolean data.

## Minor findings addressed

- Checkpoints need an effective assertion. Null scalar/list expectations and wholly empty fact/absence checks are rejected; `action_results: []` and `action_arguments: []` remain meaningful.
- Scenario version requires a real integer before Literal validation. Complete valid-looking documents with boolean, float or string versions are rejected. The old incomplete boolean-version test was insufficient; complete-document regressions now prove the boundary.

## Additional parent corrections

A full-suite event-budget failure exposed timing-dependent verification and delayed abort after the drain failed. `c3c5b74` monitors the execution task and event consumer together, aborts backpressured work immediately on an overflow, and has a regression distinguishing event overflow from the wall-clock stall guard. That correction also provides the queue-drain fence used for request assertions.

The core-only wheel test now invokes the shipped scenario CLI outside the checkout, using copied YAML/Markdown and no application tool module or optional server/SDK dependencies. Five executable repair examples cover booking, interruption, refusal, correction and repeated requests.

Fix pass: `7cdf590`; preceding diagnostic/navigation/provenance commits: `b75656c`, `2bf2e32`, `ee0907a`, `c3c5b74`. No second independent review was requested or performed. Regression verification is the implementer's evidence, not a claim that the reviewer approved the corrected head.

At code head `7cdf590`: **381 backend**, **178 frontend**, **85 sequential browser** tests passed; production build, Ruff, five bundled scenarios and eight local retrieval checks passed. Actual direct-rule and live diagnostic screenshots were inspected at 1024/1440. Paid inference, real acoustic acceptance, hosted CI, push, deployment, license selection and external adoption were not performed.
