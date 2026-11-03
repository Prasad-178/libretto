import { Select } from "../ui/Select";
import { useEffect, useRef, useState } from "react";
import { readWorkflow } from "../workflow";
import { createStudioApi, type SourceFolders } from "./runtime-api";
import { applyTransaction } from "./yaml-edits";
import type { EditOperation } from "./types";
export function AddCollectionDialog({
  source,
  onChange,
  onClose,
}: {
  source: string;
  onChange: (source: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [folders, setFolders] = useState<SourceFolders["folders"]>([]),
    [selected, setSelected] = useState(""),
    [id, setId] = useState(""),
    [all, setAll] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    createStudioApi("")
      .folders(controller.signal)
      .then((data) => setFolders(data.folders))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      controller.abort();
      dialog.current?.close();
    };
  }, []);
  const folder = folders.find((f) => f.path === selected);
  return (
    <dialog
      className="source-usage-dialog"
      ref={dialog}
      aria-label="Add collection"
      onCancel={onClose}
    >
      <header>
        <h2>Add collection</h2>
        <button aria-label="Close add collection" onClick={onClose}>
          ×
        </button>
      </header>
      <p>
        Choose an existing Markdown folder inside the configured project. This
        updates references in your draft.
      </p>
      <label>
        Project folder
        <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose folder…</option>
          {folders.map((f) => (
            <option key={f.path}>{f.path}</option>
          ))}
        </Select>
      </label>
      <label>
        Collection ID
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="company"
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />
        Available to all steps
      </label>
      {folder && (
        <>
          <p>
            Found {folder.markdownFiles.length} Markdown files:{" "}
            {folder.markdownFiles.join(", ")}
          </p>
          <p>
            Skipped {folder.skippedFiles.length} files
            {folder.skippedFiles.length
              ? `: ${folder.skippedFiles.join(", ")}`
              : ""}
          </p>
          <h3>YAML change</h3>
          <pre>{`knowledge:\n  ${id || "collection_id"}: ${selected}\n${all ? `common_knowledge: [...existing, ${id || "collection_id"}]` : "# Attach to steps using Edit usage after adding."}`}</pre>
        </>
      )}
      {error && (
        <p role="alert" className="inspector-error">
          {error}
        </p>
      )}
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          className="button black"
          disabled={!folder || !id.trim()}
          onClick={() => {
            try {
              const workflow = readWorkflow(source);
              if (!workflow)
                throw new Error("Fix YAML before adding a collection.");
              if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id))
                throw new Error(
                  "Use a short ID starting with a letter, followed by letters, digits, underscores or hyphens.",
                );
              if (Object.hasOwn(workflow.knowledge || {}, id))
                throw new Error("This collection ID already exists.");
              const operations: EditOperation[] = [
                { op: "set", path: ["knowledge", id], value: folder!.path },
              ];
              if (all)
                operations.push({
                  op: "set",
                  path: ["common_knowledge"],
                  value: [...(workflow.common_knowledge || []), id],
                });
              onChange(
                applyTransaction(source, {
                  label: "Attach collection",
                  operations,
                }).source,
              );
              onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Add to draft
        </button>
      </footer>
    </dialog>
  );
}
