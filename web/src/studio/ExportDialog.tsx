import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { StudioDocument } from "./types";
import {
  buildExportFiles,
  exportActionLabel,
  layoutFilename,
} from "./project-files";
import { describeChanges } from "./changes";
import { ChangeList } from "./ChangeList";
export function ExportDialog({
  document,
  onClose,
  onExported,
}: {
  document: StudioDocument;
  onClose: () => void;
  onExported: (source: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [yaml, setYaml] = useState(true),
    [layout, setLayout] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const changes = useMemo(
    () => describeChanges(document.importedSource, document.source),
    [document.importedSource, document.source],
  );
  const valid = document.validation.state === "valid",
    files = [
      ...(yaml ? [{ filename: document.filename }] : []),
      ...(layout ? [{ filename: layoutFilename(document.filename) }] : []),
    ];
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function download() {
    const captured = document;
    setBusy(true);
    try {
      const built = await buildExportFiles(captured, layout);
      for (const file of built.filter(
        (f) => yaml || f.filename !== captured.filename,
      )) {
        const url = URL.createObjectURL(
            new Blob([file.bytes.slice().buffer], { type: file.mime }),
          ),
          link = window.document.createElement("a");
        link.href = url;
        link.download = file.filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (yaml) onExported(captured.source);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="export-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-label="Export workflow"
    >
      <header>
        <h2>Export workflow</h2>
        <button aria-label="Close export review" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="export-dialog-scroll">
        <p className={valid ? "export-valid" : "export-draft"}>
          {changes.length} {changes.length === 1 ? "edit" : "edits"} ·{" "}
          {valid ? "valid definition" : "unvalidated draft"}
        </p>
        {!valid && (
          <p className="workspace-help">
            This download is a draft. It cannot start a test until runtime
            validation passes.
          </p>
        )}
        <ChangeList changes={changes} />
        <div className="export-file-options">
          <label>
            <input
              type="checkbox"
              checked={yaml}
              onChange={(e) => setYaml(e.target.checked)}
            />
            <span>
              <strong>{document.filename}</strong>
              <small>
                {valid
                  ? "Executable workflow"
                  : "YAML draft · validation needed"}
              </small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={layout}
              onChange={(e) => setLayout(e.target.checked)}
            />
            <span>
              <strong>{layoutFilename(document.filename)}</strong>
              <small>
                Optional shared layout · keep beside {document.filename}
              </small>
            </span>
          </label>
        </div>
        <p className="workspace-help">
          Device preferences and connection credentials are excluded.
        </p>
        <p className="export-ownership">
          Downloads do not overwrite your original files. Studio cannot see
          changes made in your project folder; reopen the YAML before replacing
          a newer local version.
        </p>
        {error && (
          <p role="alert" className="inspector-error">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button onClick={onClose}>Keep editing</button>
        <button
          className="button black"
          disabled={!files.length || busy}
          onClick={() => void download()}
        >
          {busy ? "Preparing…" : exportActionLabel(files)}
        </button>
      </footer>
    </dialog>
  );
}
