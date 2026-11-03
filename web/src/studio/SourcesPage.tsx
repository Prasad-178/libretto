import { useEffect, useMemo, useState, useRef } from "react";
import { readWorkflow } from "../workflow";
import type { StudioDocument, StudioMetadata } from "./types";
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
}: {
  document: StudioDocument;
  capabilities: StudioCapabilities | null;
  onChange: (source: string) => void;
  onMetadata: (metadata: StudioMetadata) => void;
  selectedStep: string;
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
  useEffect(() => {
    const controller = new AbortController();
    setManifest(null);
    setPreview(null);
    setPassage(null);
    setBusy(true);
    setError("");
    api
      .sources(document.source, controller.signal)
      .then(setManifest)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [document.source, api]);
  useEffect(() => {
    setPreview(null);
    setPassage(null);
  }, [query, step]);
  useEffect(() => {
    if (workflow && !workflow.nodes[step]) setStep(workflow.start);
  }, [workflow?.start, step]);
  const retrievalController = useRef<AbortController | null>(null);
  const currentRequest = useRef("");
  currentRequest.current = JSON.stringify([document.source, step, query]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    retrievalController.current?.abort();
    setSearching(false);
    return () => retrievalController.current?.abort();
  }, [document.source, step, query]);
  const [adding, setAdding] = useState(false);
  const collection =
    manifest?.collections.find((c) => c.id === selected) ||
    manifest?.collections[0];
  const label = (id: string) =>
    document.metadata.sourceNames[id] || humanizeId(id);
  const documents =
    collection?.documents.filter((d) =>
      d.name.toLowerCase().includes(filter.toLowerCase()),
    ) || [];
  const passages = preview?.passages || documents.flatMap((d) => d.passages);
  async function retrieve() {
    if (!step || !query.trim()) return;
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
            {manifest?.collections.length || 0}{" "}
            {manifest?.collections.length === 1 ? "collection" : "collections"}
          </span>
        </header>
        <select
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
        </select>
        {capabilities?.folderSelection && (
          <button
            className="button"
            disabled={!!document.running}
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
        <p className="workspace-help">
          {capabilities?.folderSelection
            ? "Local project folders are available through the runtime."
            : "To attach local Markdown folders, run libretto serve workflow.yaml --project-root . locally."}
        </p>
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
              disabled={!!document.running}
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
        {busy && <p role="status">Loading sources…</p>}
        {collection && (
          <>
            <p className="source-scope">
              {collection.scope.allSteps
                ? "Available to all steps"
                : collection.scope.stepIds.length
                  ? `Used by ${collection.scope.stepIds.map((id) => workflow?.nodes[id]?.title || id).join(", ")}`
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
                  disabled={!!document.running}
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
                disabled={!!document.running}
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
                <select value={step} onChange={(e) => setStep(e.target.value)}>
                  {Object.entries(workflow?.nodes || {}).map(([id, n]) => (
                    <option value={id} key={id}>
                      {n.title || id}
                    </option>
                  ))}
                </select>
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
                disabled={busy || searching || !query.trim()}
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
          passage={passage}
          onClose={() => setPassage(null)}
        />
      )}
      {adding && (
        <AddCollectionDialog
          source={document.source}
          onChange={onChange}
          onClose={() => setAdding(false)}
        />
      )}
      {usage && workflow && collection && (
        <SourceUsageDialog
          source={document.source}
          workflow={workflow}
          sourceId={collection.id}
          onChange={onChange}
          onClose={() => setUsage(false)}
        />
      )}
    </section>
  );
}
