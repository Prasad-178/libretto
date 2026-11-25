# Compatibility and setup

[Quickstart](quickstart.md) · [Library API](library.md) · [LiveKit](livekit.md) · [Roadmap](../ROADMAP.md)

This describes the **[v0.1.0 source release](releases/v0.1.0.md)** under the [MIT license](../LICENSE). It includes the first-workflow starter. The Python distribution is `libretto-voice`; imports use `libretto`.

Earlier source commits also reported `0.1.0`. Use the release tag or exact Git commit as well as the package version: `0.1.0` alone does not identify these APIs or examples. Distribution remains through source/GitHub, with no package-registry publication. The release process checks hosted CI at the tag target before publishing.

## Choose an installation profile

| Profile | Includes | Resources you supply |
| --- | --- | --- |
| Core | Compiler, runner, tool registry, scenario CLI; Pydantic and PyYAML | Your YAML, scenarios, application handlers and provider implementations |
| `providers` extra | Core plus HTTPX for the bundled OpenRouter adapters | Provider credentials and application configuration when making live calls |
| `livekit` extra | Core plus pinned LiveKit Agents and AssemblyAI, Cartesia and Deepgram plugins | Your application/media integration, workflow, tools and credentials |
| `studio` extra | LiveKit extra plus FastAPI, HTTPX, dotenv, Uvicorn and WebSocket dependencies | A source checkout and built frontend assets for the supported Studio setup |
| Repository default groups | Studio runtime plus development/test tooling | The checkout's Python/Node lockfiles and frontend build |

Extras are Python dependencies, not copies of the demo resources. The core wheel does not contain repository examples, Markdown collections or built Studio assets. Installing `[studio]` alone is not a standalone prebuilt Studio distribution. [Local setup](../README.md#run-locally) builds the assets from the same checkout as the backend.

### Independent application

In your application's directory:

```sh
uv venv --python 3.12
uv pip install --python .venv 'libretto-voice @ git+https://github.com/Prasad-178/libretto.git@v0.1.0'
```

The explicit `--python .venv` selects this project’s environment even when your shell has another environment active. For an optional integration, choose the extra explicitly. For example, the bundled HTTP adapters:

```sh
uv pip install --python .venv 'libretto-voice[providers] @ git+https://github.com/Prasad-178/libretto.git@v0.1.0'
```

Use `[livekit]` or `[studio]` in the same dependency position when your application needs those dependencies. A Git pin fixes Libretto source; your application's lockfile must also fix transitive dependency versions. The repository's `uv.lock` is used by checkout installs, not automatically adopted by a consuming application using `uv pip install`.

See the [quickstart](quickstart.md) for a complete independent project and expected output. No provider credentials are needed for its scripted tests or fictional Python tool.

### Core-only source checkout

From a checkout of the chosen commit:

```sh
uv sync --locked --no-default-groups
uv run --locked --no-default-groups libretto test examples/quickstart/record-request.scenario.yaml
```

Keep `--no-default-groups` on later `uv run` commands too, or use the environment's executable directly. A bare `uv sync` or `uv run` selects this repository's default `dev` and `studio` groups. `--no-dev` alone still leaves the default Studio group; it is not the core-only setup.

### Studio source checkout

Use the same Git revision for Python code, examples and frontend source:

```sh
uv sync --locked
npm --prefix web ci
npm --prefix web run build
uv run libretto serve
```

Open `http://127.0.0.1:8000/studio`. Starting the server does not start provider inference. Deliberately starting a connected text/voice test does. A local server may load your development `.env`; use session-only Connection inputs if preferred. Never place credentials in YAML, sidecars or frontend environment variables.

The default server registers Northline's simulated tools. For a workflow with application-specific tools, compose `create_app(..., tool_factory=...)` in Python; see the [library guide](library.md#compilation-and-execution-limits). Opening YAML in the public demo cannot register a handler or grant access to files beside it. Validate custom-tool workflows in application code with `compile_workflow(..., tools=your_registry)`. The standalone `libretto validate` CLI builds its own registry and cannot accept an application factory or import arbitrary Python handlers.

## Requirements and verification boundaries

| Component | Declared requirement or selected configuration | Verification at this baseline |
| --- | --- | --- |
| Python | `>=3.12` in package metadata | CI uses Python 3.12; independent macOS installs used 3.12.11. Other Python minors are not a tested matrix. |
| Node for Studio | Prefer Node **24**. Current Vitest engine range allows 22.12.x and later 22.x, 24.x, or 26+. The test-tool range is narrower than Vite's own range. | CI uses Node 24; local tooling uses 24.3.0. No claim that every permitted major or OS has been tested. |
| uv | Checkout commands require support for lockfiles and dependency groups; no minimum uv version is declared by the project | These commands were checked with uv 0.9.0; CI uses setup-uv. Keep `--locked` to detect incompatible/outdated lock state. |
| LiveKit Agents | **1.8.10**, pinned by the optional extra | SDK configuration, synthetic delivery/interruption and server tests pass. Live-provider acoustic/semantic acceptance remains pending. |
| Browser | Desktop Studio, viewport at least 1024px wide | Automated browser checks use Playwright Chromium on CI; this does not establish Safari/Firefox, mobile or assistive-technology coverage. |
| OS | No complete supported-OS matrix is declared | Hosted CI is Ubuntu; independent installation checks are macOS. Windows executable substitutions are documented but not independently exercised. |

Package installation enforces the Python floor; npm/individual tools apply their own engine behavior. These documents do not add a universal version check to the Libretto CLI. Do not upgrade the LiveKit pin or infer plugin/model compatibility from a successful installation alone.

Current default speech is LiveKit custom PCM/WebSocket IO, with AssemblyAI STT and Cartesia TTS through LiveKit Inference. Room playback is a separate integration boundary. Direct provider keys and **Direct Deepgram** remain explicit alternatives. Recognition vocabulary and patient tuning are not active in the current LiveKit adapter; see its documented capabilities. [Speech setup and configuration migration](livekit.md) explains supported routes and credentials.

## Separate version contracts

A package version, a workflow schema number and an evidence version identify different things:

| Artifact | Current contract | Compatibility behavior |
| --- | --- | --- |
| Workflow YAML | `version: 1` | Write the integer spelling `version: 1`. The compiler rejects other version numbers such as 2, but its current workflow reader also coerces `true` and `1.0` to 1; this is not the scenario reader’s exact-type rule. Graph/reference and registered-tool validation still apply. Schema 1 does not guarantee every historical document passes every later compiler. |
| Scenario input | Integer `version: 1` | Strict scenario fields; aliases/anchors and unsupported versions are rejected. CLI setup errors exit 2; failed assertions exit 1. |
| Saved scripted evidence | `format: libretto.scenario-evidence`, `version: 1` | Studio's saved-test reader validates this envelope. It replays projected events without running tools/providers. Navigation requires matching YAML source hash. |
| Studio sidecar | `version: 1` in `<name>.studio.json` | Presentation only. Unsupported versions fail import; references that no longer match can be ignored with notices. It never changes execution authority. |
| Live session export | `format: libretto.session-evidence`, `version: 1` | A distinct diagnostic export, potentially containing transcript/application data. It is not a saved scripted scenario bundle and cannot be opened as one. |

Some changes have been made within workflow schema 1. The [request-policy migration](migrations/request-policies.md) covers explicit request/confirmation declarations, registered tool signatures, outcome coverage and handler arguments. The [LiveKit guide](livekit.md) covers speech-engine normalization and recognized Direct Deepgram configurations. There is no automatic general-purpose schema migration or guarantee that old saved drafts/exports upgrade silently.

## API and application boundaries

Use the documented [root imports and lifecycle](library.md#public-surface-and-lifecycle), plus separately documented testing/integration entrypoints. Private runner/session state and SDK internals are not a supported compatibility surface. This source baseline does not establish a future SemVer stability promise.

The application registers tool contracts and async handlers; YAML selects registered tool names and maps fields to arguments. A change to a parameter type, result name or confirmation rule is an application migration even if the YAML version stays 1. Compile against your real registry and run scenarios after such a change. The scenario tool declarations simulate results; they do not invoke your application's actual handlers.

Libretto's runtime authority remains the same across integrations. Text-mode event consumption acknowledges text; external audio mode requires actual matching delivery acknowledgements. Connecting a transport must not weaken confirmation requirements. In-memory request/action identities provide session-local safeguards; external durable effects still need application-owned idempotency and recovery. An `unknown` tool outcome is not permission for automatic retry.

## Upgrade and rollback checklist

1. Record the current Git revision, application dependency lock, YAML, Markdown sources, tool contracts and optional sidecar. Explicit exports/backups matter: a browser draft is not a filesystem backup.
2. Install the candidate source pin in a separate environment or checkout. Keep source/example/backend/frontend revisions together. Preserve the old environment until checks pass.
3. Compile your YAML against the application's registered tools. Read path-specific failures; use the linked migration guides instead of renaming fields/results speculatively.
4. Run your offline scenarios, including missing information, corrections, refusal, interrupted readback, repeated requests and uncertain outcomes where applicable. Confirm actual handler integration with fictional tools separately from scripted scenario results.
5. If using Studio, install from its lockfiles and rebuild assets. Open copied YAML/sidecar files and inspect editing, exports and recovery. A source edit changes its hash, so navigation from older saved evidence may be disabled deliberately.
6. If a speech SDK, model or credential route changed, run deliberate budget-bounded live checks. Synthetic tests do not establish recognition, synthesis, authentication or listening quality.
7. Move the consuming application to the verified pin and lockfile. To roll back, restore the earlier source/environment and compatible backed-up YAML/assets; the old code is not guaranteed to accept definitions saved with newer semantics. Libretto does not roll back completed business actions.

## Current limits

Keep the [library limits](library.md#compilation-and-execution-limits), [credential boundaries](security.md) and [voice acceptance status](milestones/2026-11-13-live-voice-acceptance.md) with your integration notes. No account system, managed Libretto runtime, durable session recovery or deployment service is introduced by these installation profiles.
