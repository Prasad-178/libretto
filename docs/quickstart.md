# Your first Libretto workflow

Build a small support-request workflow, test its required information, then run a Python tool. Everything in this guide is local and scripted: no API keys, model requests, microphone, Node or web server are needed for the first result.

You will create three files:

| File | What you own |
| --- | --- |
| [`workflow.yaml`](../examples/quickstart/workflow.yaml) | Steps, collected information, action prerequisites and result destinations |
| [`record-request.scenario.yaml`](../examples/quickstart/record-request.scenario.yaml) | Example turns, scripted evaluator proposals, simulated tool results and assertions |
| [`app.py`](../examples/quickstart/app.py) | The registered Python handler and adapters used by your application |

This is a first integration exercise, not a natural-language or voice-quality test. This guide uses the [MIT-licensed](../LICENSE) [v0.1.0 source release](releases/v0.1.0.md).

## 1. Install the core in your own folder

Prerequisites: Git, Python **3.12+**, and [uv](https://docs.astral.sh/uv/). Commands below use a macOS/Linux shell. On Windows PowerShell replace `.venv/bin/python` with `.venv\Scripts\python.exe` and `.venv/bin/libretto` with `.venv\Scripts\libretto.exe`; use `Copy-Item starter-source/examples/quickstart/* my-agent/` for the copy step.

From an empty working directory, copy the starter from the same release tag used for the core:

```sh
git clone https://github.com/Prasad-178/libretto.git starter-source
git -C starter-source checkout --detach v0.1.0
mkdir my-agent
cp starter-source/examples/quickstart/* my-agent/
cd my-agent
uv venv --python 3.12
uv pip install --python .venv 'libretto-voice @ git+https://github.com/Prasad-178/libretto.git@v0.1.0'
```

The explicit `--python .venv` target keeps installation in this project even if another virtual environment is active. The source baseline is the v0.1.0 release tag. It pins Libretto source, not transitive dependency versions; use your application’s lockfile to freeze those. The starter files come from the pinned source checkout; they are not bundled in the installed core wheel. Keep that source revision with your own project when reproducing an integration. The source pin contains the starter, while the installed core wheel does not. See [compatibility and setup](compatibility.md) for install profiles, version evidence and upgrades.

`my-agent` is independent of the checkout: the app finds YAML beside its own file. The core's required dependencies are Pydantic and PyYAML. You do not need to install the Studio or LiveKit extras for this guide.

## 2. Run your first scenario

```sh
.venv/bin/libretto test record-request.scenario.yaml --output evidence.json
```

Expect a **PASS** for “A support request needs a summary” and exit code **0**. The scenario first submits “Hello” without any extracted summary and checks that no action runs. It then proposes `summary: Printer is jammed` and checks the destination, one recorded result, and exact action arguments.

The evaluator proposals are deliberately written into the scenario. It tests how Libretto handles those proposals; it does not test whether a model would infer them from speech or text.

`evidence.json` contains the saved scripted result and event sequence. Open the public [Studio](https://libretto.prasadjs.me/studio), then **Test & debug → Open saved test**, to inspect it without connecting to providers. Navigation into the graph requires the matching YAML. This example has a custom tool; the public demo cannot run its application handler just because you import its YAML.

## 3. Run your Python handler

```sh
.venv/bin/python app.py
```

Expected JSON:

```json
{"stage": "end", "tool": "record_request", "status": "recorded", "receipt": "fictional-request-1", "arguments": {"summary": "Printer is jammed"}}
```

Unlike the scenario command, this executes the `record_request` Python handler registered by `create_tools()` in `app.py`. It returns a fictional receipt in memory; it does not create a ticket in an external system. The app's evaluator simply treats the entire submitted text as the summary, and its responder emits a fixed reply. Replace those adapters to introduce real language understanding later.

The workflow is small on purpose:

```text
Collect the issue → Record the request → End
```

- `fields.summary` defines the collected string. `begin_request: support` starts its request scope.
- The `details_ready` predicate permits the move to `record` only when the summary exists.
- `requires` and `arguments` make the tool's prerequisites and input mapping explicit.
- Python declares the tool's parameter/result contract. YAML routes each result (`recorded`, `failed`, `unknown`) to its destination. YAML never imports or executes handler code.

This example requires information but does **not** ask for user approval. For actions needing consent, readback and a later confirmation, use the [repair workflow](../examples/repair_visit/agent.yaml) and [confirmation guide](migrations/request-policies.md). Libretto's in-memory execution identities do not replace durable idempotency in your application or downstream service.

## 4. Change something and prove it

Change the `collect` step's `prompt` in `workflow.yaml`, then rerun the scenario. It should still pass: the fixed scripted evaluator does not judge prompt wording.

Next, change the summary in the scenario's details turn, its `evaluation.updates.summary.value` and `evidence`, and the final `action_arguments` expectation to `Monitor is flickering`. Rerun the scenario and inspect the new arguments in its evidence. The app has its own input in `runner.submit(...)`; edit that separately if you want its output to change too.

Finally, change the last checkpoint's `action_count` from `1` to `2`, leaving the workflow and tool response alone. Rerun the command. Expect **FAIL**, `action_count: expected 2, got 1`, and exit code **1**. Restore `1` and rerun to get back to PASS.

This gives you a small development loop: change YAML or a scenario → run the test → inspect the failure → fix it. The [scenario guide](scenario-evidence.md) explains delivery steps, sensitive fields and replay; [runtime diagnostics](runtime-diagnostics.md) explains blocked actions.

## Optional: Studio and real voice

The core wheel contains Python modules, not a prebuilt Studio or repository examples. To run Studio, return to the source checkout and follow [local setup](../README.md#run-locally); it uses Node **24**, the major used in CI, `uv sync --locked`, and a frontend build.

For a local application with custom tools, use `create_app(..., tool_factory=...)` as explained in the [library guide](library.md#compilation-and-execution-limits). `libretto serve workflow.yaml` alone does not register arbitrary application handlers. `libretto validate workflow.yaml` similarly has no custom-handler import mechanism; this starter validates its tool contracts through `compile_workflow` in `app.py` and through its scenario definitions.

To try the existing repair example with LiveKit, use the [LiveKit example](../examples/livekit_repair/README.md). Speech through LiveKit Inference uses your LiveKit key/secret; the bundled language adapters use your OpenRouter key. Direct provider credentials are also supported. Those are paid provider paths; this offline quickstart does not start them. Real-provider acceptance is still pending the [bounded voice checks](milestones/2026-11-13-live-voice-acceptance.md).

## If something fails

| Symptom | Check |
| --- | --- |
| Python version error during installation | Use `uv venv --python 3.12`; the core requires Python 3.12+. |
| `libretto` is not found | Use the explicit virtual-environment executable above, from `my-agent`. |
| A workflow/scenario file cannot be found | Confirm all three starter files were copied and run the scenario command from `my-agent`. |
| `unknown tool` in Studio or standalone validation | Register the tool in your Python application; importing YAML does not register Python handlers. |
| Scenario exits 1 | Read the failed assertion. The deliberate wrong action count above is an example. |
| Scenario exits 2 | Fix invalid YAML, missing files, an invalid tool contract or other reported setup errors. |
| `failed` or `unknown` result | Inspect the actual receipt. The starter ends on all outcomes; it does not retry or claim success for either. Design recovery branches for your application. |

Continue with the [library API](library.md), [five repair scenarios](../examples/scenarios), and [architecture](architecture.md). Outside-developer trials are the remaining adoption work in M4; the usability target has not yet been measured.
