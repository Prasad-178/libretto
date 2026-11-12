import { useEffect, useRef, useState } from "react";
import type { DocumentTransaction, StudioMetadata } from "./types";
import { editCollection } from "./source-usage";
export function CollectionSettingsDialog({
  source,
  id,
  path,
  metadata,
  onSave,
  onClose,
}: {
  source: string;
  id: string;
  path: string;
  metadata: StudioMetadata;
  onSave: (tx: DocumentTransaction) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const openedSource = useRef(source);
  const stale = openedSource.current !== source;
  const [nextId, setNextId] = useState(id),
    [nextPath, setNextPath] = useState(path),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="source-usage-dialog"
      aria-label="Collection settings"
      onCancel={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (stale) return;
          try {
            onSave(editCollection(source, id, nextId, nextPath, metadata));
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <header>
          <h2>Collection settings</h2>
          <button
            type="button"
            aria-label="Close collection settings"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p>
          References a Markdown folder; your files stay on disk. Studio checks
          the folder against this runtime’s project boundary.
        </p>
        <label>
          Folder path
          <input
            autoFocus
            required
            value={nextPath}
            onChange={(event) => setNextPath(event.target.value)}
          />
        </label>
        <details>
          <summary>Advanced · Collection ID</summary>
          <label>
            Collection ID
            <input
              required
              value={nextId}
              onChange={(event) => setNextId(event.target.value)}
            />
          </label>
          <p>Renaming updates shared and step knowledge references together.</p>
        </details>
        {stale && (
          <p role="alert">
            The draft changed while these settings were open. Close and reopen
            them before saving.
          </p>
        )}
        {error && (
          <p role="alert" className="inspector-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button black" type="submit" disabled={stale}>
            Save collection
          </button>
        </footer>
      </form>
    </dialog>
  );
}
