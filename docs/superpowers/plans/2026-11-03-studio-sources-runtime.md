# Local Project and Sources Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Execute inline unless delegation is separately authorized.

**Goal:** Give Studio truthful local-project/source capabilities and retrieval evidence while preserving the public demo's filesystem and tool restrictions.

**Architecture:** A configured workspace resolves source directories relative to an explicitly opened workflow and inside an allowed project root. Each inspection/retrieval request compiles the submitted draft in that workspace and returns a fingerprint plus source evidence. Reuse the runtime's retriever and registered tool adapter; do not add uploads, hidden file writes or a second retrieval algorithm.

**Tech Stack:** Existing FastAPI/Pydantic, pathlib, local BM25, pytest/httpx and TypeScript fetch client.

**Spec:** [Studio v2 specification](../specs/2026-11-03-studio-v2.md). Integration order: Studio Tasks 1–6 may proceed independently; Studio Task 8 consumes this plan's contracts.

## Global Constraints

- Default `create_app()` stays the bundled hosted demo. No arbitrary filesystem path is accepted from its browser client.
- Local mode is explicitly configured by CLI/Python startup, not enabled by a request parameter or an untrusted Host header.
- Source paths stay within the configured root after symlink resolution. UI selection changes YAML references and does not copy, delete or overwrite files.
- Current missing directories yield zero passages, not a fabricated YAML-schema error. Preserve that behavior and add a warning.
- Retrieval preview uses the runtime's effective common-plus-step scope and the same index/search function. No model calls or generated answers.
- Credentials never appear in config/manifests, responses or persisted drafts. Preserve the current origin, budget and session protections.
- No PyPI publication, cloud ingestion, LiveKit implementation or general library-runtime claim.

## API contracts

Create Pydantic request/response models in `src/libretto/studio_api.py` and mirror the public shapes in `web/src/studio/runtime-api.ts`. Keep the existing workflow-validation endpoint and WebSocket protocol backward compatible.

```ts
export type ToolManifest = {
  name: string;
  parameters: { name: string; type: "string" | "boolean"; required: boolean }[];
  results: string[];
};
export type StudioCapabilities = {
  mode: "hosted-demo" | "local-project";
  localProjectAccess: boolean;
  folderSelection: boolean;
  retrievalPreview: boolean;
  tools: ToolManifest[];
  modelChoices: { role: "response" | "evaluator"; id: string }[];
  speechChoices: { role: "stt" | "tts"; provider: string; model: string }[];
};
export type PassageEvidence = {
  source: string; document: string; heading: string;
  chunk_id: string; content_hash: string; text: string; score: number;
};
export type SourceManifest = {
  sourceFingerprint: string;
  collections: {
    id: string; path: string; missing: boolean;
    scope: { allSteps: boolean; stepIds: string[] };
    documents: { name: string; bytes: number; passages: PassageEvidence[] }[];
  }[];
  warnings: { code: "missing_source"; sourceId: string; path: string; message: string }[];
};
export type RetrievalPreview = {
  sourceFingerprint: string; stepId: string; query: string;
  limit: number; effectiveSources: string[]; terms: string[];
  passages: PassageEvidence[];
};
```

HTTP requests/responses:

- `GET /api/studio/capabilities` → `StudioCapabilities`.
- `GET /api/studio/source-folders` → `{folders: {path: string; markdownFiles: string[]; skippedFiles: string[]}[]}`. Hosted mode responds 403 with a local-setup explanation. Paths are project-relative; selection is restricted to the configured workspace.
- `POST /api/studio/sources`, body `{source: string}` → `SourceManifest`.
- `POST /api/studio/retrieval`, body `{source: string, stepId: string, query: string, limit: number}` → `RetrievalPreview`.

Use current 100,000-character source bound, query bound 8,000, limit 1–3. Fingerprint is SHA-256 of submitted source encoded UTF-8, with no hidden newline normalization. API errors use structured path/message issues; invalid source/step is 422, unsupported folder capability is 403 and unavailable configured runtime remains an ordinary network failure in the client.

### Task 1: Make runtime workspace selection explicit

**Files:** Create `src/libretto/workspace.py`, `tests/test_workspace.py`; modify `src/libretto/server.py`, `cli.py`, `tools.py`, `tests/test_cli.py`, `tests/test_server.py`.

**Interfaces:** Produce `StudioWorkspace(workflow_path: Path, project_root: Path, mode: Literal["hosted-demo", "local-project"])`, `resolve_collection(relative: str) -> Path`, `list_source_folders() -> list[dict]`, and `compile(source: str) -> tuple[Workflow, RetrievalIndex]`. Add optional `workflow_path`, `project_root` and `tool_factory` constructor arguments to `create_app`; keep defaults compatible. Each session receives its own injected tool instance/cache.

- [ ] Write failing tests for the currently ignored CLI path and real project source selection:

```python
def test_workspace_missing_folder_has_no_passages(tmp_path):
    from libretto.workspace import StudioWorkspace
    path = tmp_path / "survey.yaml"
    path.write_text(SOURCE_WITH_MISSING_DOCS)
    workspace = StudioWorkspace(path, tmp_path, "local-project")
    workflow, index = workspace.compile(path.read_text())
    assert workflow.id == "survey"
    assert index.passages == []
```

Define `SOURCE_WITH_MISSING_DOCS` in this test file, not as an unavailable fixture:

```python
SOURCE_WITH_MISSING_DOCS = """version: 1
id: survey
name: Survey
start: ask
shared_prompt: Ask one question.
knowledge: {docs: knowledge/missing}
common_knowledge: [docs]
nodes:
  ask:
    kind: conversation
    prompt: Ask what helps.
    edges:
      - {id: done, to: end, condition: The caller answered.}
  end: {kind: end}
"""
```

- [ ] Test allowed-root resolution with `../` and symlink escapes, duplicate source directories, a missing directory and a directory containing non-Markdown files. Keep access inside `tmp_path`; no test scans the developer's home directory.
- [ ] Extend CLI with an explicit `--project-root` and pass the selected `serve` workflow through to `create_app`. Use `None` as the positional workflow default so bare `libretto serve` retains bundled mode, while an explicitly supplied workflow opts into local project mode. Validate/graph/evaluate keep their documented default workflow when no path is supplied.
- [ ] Replace server closures over the receptionist workflow with the workspace's configured workflow/index where appropriate. Keep hosted compile restricted to bundled paths and registered demo tools. Local mode accepts project-contained directories and injected registered tools; it does not execute code named by YAML. Explicitly report unsupported runtime features rather than presenting custom confirmation behavior as universally supported.
- [ ] Expose tool metadata from the existing registry: `transfer_call` parameter recipient/results connected-unavailable-failed-timeout; `capture_message` parameters recipient/caller_name/callback_number/message/results captured-failed. Injection can supply another registry with the same manifest/validate/execute protocol. Preserve demo simulations and confirmations.
- [ ] Run `uv run pytest tests/test_workspace.py tests/test_cli.py tests/test_server.py tests/test_receptionist.py -q`. Commit: `feat: configure local studio workspaces`.

### Task 2: Expose source manifests and genuine retrieval evidence

**Files:** Create `src/libretto/studio_api.py`, `tests/test_studio_sources.py`; modify `server.py`, `retrieval.py`, `tests/test_retrieval.py`.

**Interfaces:** Produce `inspect_sources(workspace, source: str) -> SourceManifest` and `preview_retrieval(workspace, source: str, step_id: str, query: str, limit: int) -> RetrievalPreview`. Bind these to the endpoints above. Preserve `build_index` and `RetrievalIndex.search` behavior for existing sessions.

- [ ] Write failing response/scope tests with a local workspace and injected/no-op tools:

```python
def test_preview_uses_effective_step_scope(local_client, scoped_source):
    response = local_client.post("/api/studio/retrieval", json={
        "source": scoped_source, "stepId": "account", "query": "billing", "limit": 3,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["effectiveSources"] == ["common", "accounts"]
    assert all(p["source"] in {"common", "accounts"} for p in data["passages"])
    assert len(data["passages"]) <= 3
```

Implement `local_client`/`scoped_source` pytest fixtures in this file: a temporary project with common/accounts/unrelated Markdown directories, an account step using accounts, another step using unrelated, and valid routes to one End. `local_client` is a `TestClient(create_app(workflow_path=..., project_root=..., load_environment=False, tool_factory=...))`; no provider request occurs for inspection/retrieval.

- [ ] Compute effective sources with ordered de-duplication: common sources first, then node sources. Return normalized query terms using the existing token function and actual passage hashes/IDs/scores. Do not label BM25 scores confidence percentages. Keep the same maximum/default of three results used by the runtime.
- [ ] Return complete passage/file metadata and byte counts. Missing folders produce a warning and empty document list. A missing query match returns zero passages and the normalized terms so UI recovery can explain keyword matching.
- [ ] Verify supplied source fingerprints match exactly, different step scopes do not leak unrelated passages, invalid steps/sources are 422, out-of-root/hosted folder selection is rejected, and payloads contain no provider credentials. Cache only by workspace plus source/content fingerprint if measurement warrants it; correctness does not depend on shared mutable draft state.
- [ ] Compare preview results to `build_index(...).search(...)` directly in tests, including the bundled Dock-room query. Run `uv run pytest tests/test_studio_sources.py tests/test_retrieval.py tests/test_server.py -q`. Commit: `feat: expose scoped studio source and retrieval APIs`.

### Task 3: Add capability-aware browser client and usage transactions

**Files:** Create `web/src/studio/runtime-api.ts`, `runtime-api.test.ts`; modify `App.tsx` integration in coordination with Studio Task 8; update `README.md`, `docs/architecture.md`, `docs/testing.md`.

**Interfaces:** Produce `createStudioApi(baseUrl: string, fetcher = fetch)` with `capabilities()`, `folders()`, `sources(source)` and `retrieve({source, stepId, query, limit})`, all accepting an AbortSignal. Shared response types are the contracts above. Runtime base URL affects HTTP and WebSocket consistently; do not update one while testing against the other.

- [ ] Add failing client tests that use a fake fetch function and assert exact request source/step/limit, abort propagation, structured errors and fingerprint preservation. An unsuccessful response never leaves stale results labelled current.

```ts
const requests: Request[] = [];
const api = createStudioApi("http://127.0.0.1:8000", async (input, init) => {
  requests.push(new Request(input, init));
  return new Response(JSON.stringify({
    sourceFingerprint: "draft-hash", stepId: "account", query: "billing", limit: 3,
    effectiveSources: ["common", "accounts"], terms: ["billing"], passages: [],
  }), { headers: { "content-type": "application/json" } });
});
await api.retrieve({ source: "draft", stepId: "account", query: "billing", limit: 3 });
expect(await requests[0].json()).toEqual({
  source: "draft", stepId: "account", query: "billing", limit: 3,
});
```

- [ ] Implement capability retrieval with honest fallback on unsupported older runtimes. A capability failure is not permission to invent provider choices or enable folder access. Connection-check UI uses the selected endpoint and local session configuration.
- [ ] Document `libretto serve path/to/agent.yaml --project-root path/to/project`, source-relative folder resolution, unchanged file ownership, metadata-file pairing and hosted limitations. Explain the remaining generic-library/confirmation-policy boundary; this plumbing is not the promised stable OSS package API.
- [ ] Run `npm --prefix web test -- runtime-api.test.ts`, frontend build, targeted backend checks, then integrate Studio Task 8. Commit: `feat: connect studio to local source capabilities`.

## Exit criteria

An explicit local project and the default hosted demo both work. The browser only presents source actions supported by that mode. Preview results match the real retriever; warnings accurately describe missing sources; path/tool/credential boundaries remain enforced. All three tasks and the corresponding Studio integration tests pass without paid inference or filesystem writes to the user's source documents.
