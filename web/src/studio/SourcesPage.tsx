import { CollectionSettingsDialog } from "./CollectionSettingsDialog";
import { Select } from "../ui/Select";
import { useEffect, useMemo, useState, useRef } from "react";
import { readWorkflow } from "../workflow";
import type {
  StudioDocument,
  StudioMetadata,
  DocumentTransaction,
} from "./types";
import {
  createStudioApi,
  type StudioCapabilities,
  type SourceManifest,
  type RetrievalPreview,
  type PassageEvidence,
} from "./runtime-api";
import { AddCollectionDialog } from "./AddCollectionDialog";
import { SourceDetails } from "./SourceDetails";
import { SourceUsageDialog } from "./SourceUsageDialog";
import { removeCollection } from "./source-usage";
import { humanizeId } from "./workflow-model";
export function SourcesPage({
  document,
  capabilities,
  onChange,
  onMetadata,
  selectedStep,
  onIssue,
  onTransaction,
}: {
  document: StudioDocument;
  capabilities: StudioCapabilities | null;
  onChange: (source: string) => void;
  onMetadata: (metadata: StudioMetadata) => void;
  selectedStep: string;
  onIssue: (stepId?: string) => void;
  onTransaction: (tx: DocumentTransaction) => void;
}) {
  const api = useMemo(() => createStudioApi(""), []),
    workflow = readWorkflow(document.source);
  const [manifest, setManifest] = useState<SourceManifest | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [step, setStep] = useState(selectedStep),
    [preview, setPreview] = useState<RetrievalPreview | null>(null),
    [passage, setPassage] = useState<PassageEvidence | null>(null),
    [usage, setUsage] = useState(false);
  const [manifestSource, setManifestSource] = useState(""),
    [refresh, setRefresh] = useState(0);
  const stale = !!manifest && manifestSource !== document.source;
  const locked = !!document.running || stale || busy;
  const visibleWorkflow = stale ? readWorkflow(manifestSource) : workflow;
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setPassage(null);
    setBusy(true);
    setError("");
    api
      .sources(document.source, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setManifest(result);
          setManifestSource(document.source);
        }
      })
      .catch(async (e) => {
        if (controller.signal.aborted) return;
        setError(e.message);
        const previous = document.lastValid?.source;
        if (!manifest && previous && previous !== document.source) {
          try {
            const result = await api.sources(previous, controller.signal);
            if (!controller.signal.aborted) {
              setManifest(result);
              setManifestSource(previous);
            }
          } catch {
            /* The current error remains visible; no unsafe draft fallback. */
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [document.source, api, refresh]);
  useEffect(() => {
    setPreview(null);
    setPassage(null);
  }, [query, step]);
  useEffect(() => {
    if (visibleWorkflow && !Object.hasOwn(visibleWorkflow.nodes, step))
      setStep(visibleWorkflow.start);
  }, [visibleWorkflow?.start, step, manifestSource]);
  const retrievalController = useRef<AbortController | null>(null);
  const currentRequest = useRef("");
  currentRequest.current = JSON.stringify([
    document.source,
    step,
    query,
    selected,
  ]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    retrievalController.current?.abort();
    setSearching(false);
    return () => retrievalController.current?.abort();
  }, [document.source, step, query, selected]);
  const [adding, setAdding] = useState(false),
    [editing, setEditing] = useState(false);
  const collection =
    manifest?.collections.find((c) => c.id === selected) ||
    manifest?.collections[0];
  const label = (id: string) =>
    Object.hasOwn(document.metadata.sourceNames, id)
      ? document.metadata.sourceNames[id]
      : humanizeId(id);
  const documents =
    collection?.documents.filter((d) =>
      d.name.toLowerCase().includes(filter.toLowerCase()),
    ) || [];
  const passages = preview?.passages || documents.flatMap((d) => d.passages);
  async function retrieve() {
    if (!step || !query.trim() || locked) return;
    const source = document.source;
    retrievalController.current?.abort();
    const controller = new AbortController();
    retrievalController.current = controller;
    const requestKey = currentRequest.current;
    setSearching(true);
    setPreview(null);
    setPassage(null);
    setError("");
    try {
      const result = await api.retrieve(
        {
          source,
          stepId: step,
          query,
          limit: 3,
        },
        controller.signal,
      );
      if (
        requestKey === currentRequest.current &&
        result.sourceFingerprint === manifest?.sourceFingerprint
      )
        setPreview(result);
    } catch (e) {
      if (!controller.signal.aborted && requestKey === currentRequest.current)
        setError((e as Error).message);
    } finally {
      if (retrievalController.current === controller) setSearching(false);
    }
  }
  return (
    <section className="sources-page" aria-label="Sources">
      <aside className="sources-library">
        <header>
          <h2>Sources</h2>
          <span>
            {busy
              ? "Loading…"
              : !manifest
                ? "Unavailable"
                : `${manifest.collections.length} ${manifest.collections.length === 1 ? "collection" : "collections"}`}
          </span>
        </header>
        <Select
          aria-label="Choose collection"
          value={collection?.id || ""}
          onChange={(e) => {
            setSelected(e.target.value);
            setPassage(null);
            setPreview(null);
          }}
        >
          {manifest?.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c.id)}
            </option>
          ))}
        </Select>
        {capabilities?.folderSelection && (
          <button
            className="button"
            disabled={locked}
            onClick={() => setAdding(true)}
          >
            + Add collection
          </button>
        )}
        <nav>
          {manifest?.collections.map((c) => (
            <button
              key={c.id}
              className={c.id === collection?.id ? "selected" : ""}
              onClick={() => {
                setSelected(c.id);
                setPassage(null);
                setPreview(null);
              }}
            >
              <strong>{label(c.id)}</strong>
              <small>
                {c.documents.length} files ·{" "}
                {c.documents.reduce((n, d) => n + d.passages.length, 0)}{" "}
                passages{c.missing ? " · Missing folder" : ""}
              </small>
            </button>
          ))}
        </nav>
        {capabilities?.folderSelection ? (
          <p className="workspace-help">
            Markdown folders are loaded from your local project.
          </p>
        ) : (
          <details className="source-local-help">
            <summary>Use your own Markdown files</summary>
            <p>Start Studio from your project folder:</p>
            <pre>
              <code>libretto serve workflow.yaml --project-root .</code>
            </pre>
            <p>
              Local folders are available when Studio runs with your project.
            </p>
          </details>
        )}
      </aside>
      <div className="source-content">
        <header>
          <div>
            <h2>{collection ? label(collection.id) : "Your sources"}</h2>
            <p>
              {collection?.path ||
                "Attach Markdown collections in your workflow."}
            </p>
          </div>
          {collection && (
            <button
              className="button"
              disabled={locked}
              onClick={() => setUsage(true)}
            >
              Edit usage
            </button>
          )}
        </header>
        {error && (
          <p className="inspector-error" role="alert">
            {error}
          </p>
        )}
        {error && (
          <button
            className="button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry sources
          </button>
        )}
        {busy && <p role="status">Loading sources…</p>}
        {stale && (
          <p className="source-warning" role="status">
            Last valid knowledge configuration · The current draft could not be
            inspected. Editing and retrieval are paused until it is fixed.
            <button className="inspector-link" onClick={() => onIssue()}>
              Open YAML to fix the draft
            </button>
          </p>
        )}
        {!stale && !!document.validation.issues.length && (
          <div className="source-warning source-workflow-issues">
            <strong>Workflow needs attention</strong>
            <p>Fix these workflow issues before starting a test.</p>
            <ul aria-label="Workflow issues">
              {document.validation.issues.map((issue, index) => {
                const stepId =
                  issue.path[0] === "nodes" && typeof issue.path[1] === "string"
                    ? issue.path[1]
                    : undefined;
                const title = stepId
                  ? visibleWorkflow?.nodes[stepId]?.title || humanizeId(stepId)
                  : "Workflow definition";
                return (
                  <li key={index}>
                    <button
                      onClick={() => onIssue(stepId)}
                      title={issue.path.join(".")}
                    >
                      <span>
                        <strong>{title}</strong>
                        <span>{issue.message}</span>
                      </span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!busy && manifest?.collections.length === 0 && (
          <p className="workspace-help">
            No knowledge collections attached.{" "}
            {capabilities?.folderSelection
              ? "Add a project Markdown folder to get started."
              : "Open a workflow with bundled knowledge, or run Studio locally to attach your own folders."}
          </p>
        )}
        {collection && (
          <>
            <p className="source-scope">
              {collection.scope.allSteps
                ? "Available to all steps"
                : collection.scope.stepIds.length
                  ? `Used by ${collection.scope.stepIds.map((id) => visibleWorkflow?.nodes[id]?.title || id).join(", ")}`
                  : "Not attached to any steps"}
            </p>
            <details className="collection-settings">
              <summary>Collection details</summary>
              <p>
                ID: <code>{collection.id}</code>
              </p>
              <label>
                Collection name
                <input
                  value={label(collection.id)}
                  disabled={locked}
                  onChange={(e) =>
                    onMetadata({
                      ...document.metadata,
                      sourceNames: {
                        ...document.metadata.sourceNames,
                        [collection.id]: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <button
                className="button"
                disabled={locked}
                onClick={() => setEditing(true)}
              >
                Edit folder and ID
              </button>
              <button
                disabled={locked}
                onClick={() =>
                  onChange(removeCollection(document.source, collection.id))
                }
              >
                Detach collection from workflow
              </button>
              <p className="workspace-help">
                Detaching removes references; your files stay on disk. Undo
                restores the references.
              </p>
            </details>
            {collection.missing && (
              <p className="source-warning">
                The folder {collection.path} is missing. Restore it in your
                project or choose another collection path in YAML.
              </p>
            )}
            <div className="source-controls">
              <label>
                Filter files
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filename…"
                />
              </label>
              <label>
                Preview for step
                <Select value={step} onChange={(e) => setStep(e.target.value)}>
                  {Object.entries(visibleWorkflow?.nodes || {}).map(
                    ([id, n]) => (
                      <option value={id} key={id}>
                        {n.title || id}
                      </option>
                    ),
                  )}
                </Select>
              </label>
            </div>
            <form
              className="retrieval-form"
              onSubmit={(e) => {
                e.preventDefault();
                void retrieve();
              }}
            >
              <label>
                Test retrieval
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What would the caller ask?"
                  maxLength={8000}
                />
              </label>
              <button
                className="button"
                disabled={locked || searching || !query.trim()}
              >
                Search passages
              </button>
            </form>
            {preview && (
              <div className="retrieval-summary">
                <strong>{preview.passages.length} ranked results</strong>
                <p>
                  Keyword terms:{" "}
                  {preview.terms.join(", ") || "No indexed terms"}
                </p>
                <p>
                  Effective sources:{" "}
                  {preview.effectiveSources.map(label).join(", ") || "None"}
                </p>
                <button
                  onClick={() => {
                    setPreview(null);
                    setPassage(null);
                  }}
                >
                  Back to all passages
                </button>
              </div>
            )}
            <div className="passages-list">
              {passages.map((p) => (
                <button
                  key={JSON.stringify([p.source, p.document, p.chunk_id])}
                  className={
                    passage?.chunk_id === p.chunk_id &&
                    passage.source === p.source
                      ? "selected"
                      : ""
                  }
                  onClick={() => {
                    setSelected(p.source);
                    setPassage(p);
                  }}
                >
                  <small>
                    {label(p.source)} / {p.document}
                    {preview ? ` · BM25 ${p.score}` : ""}
                  </small>
                  <strong>{p.heading}</strong>
                  <p>{p.text}</p>
                </button>
              ))}
              {!busy && !passages.length && (
                <p className="workspace-help">
                  {preview
                    ? "No matching passages. Try words that appear in the documents, or check this step’s source usage."
                    : "No passages in this file filter. Check the folder and Markdown headings."}
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {passage && collection && (
        <SourceDetails
          collection={collection}
          name={label(collection.id)}
          passage={passage}
          onClose={() => setPassage(null)}
        />
      )}
      {editing && !locked && collection && (
        <CollectionSettingsDialog
          source={document.source}
          id={collection.id}
          path={collection.path}
          metadata={document.metadata}
          onSave={onTransaction}
          onClose={() => setEditing(false)}
        />
      )}
      {adding && (
        <AddCollectionDialog
          source={document.source}
          onChange={onChange}
          onClose={() => setAdding(false)}
        />
      )}
      {usage && !locked && workflow && collection && (
        <SourceUsageDialog
          source={document.source}
          workflow={workflow}
          sourceId={collection.id}
          name={label(collection.id)}
          onChange={onChange}
          onClose={() => setUsage(false)}
        />
      )}
    </section>
  );
}
