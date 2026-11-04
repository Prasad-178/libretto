import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function RenameDialog({
  name,
  filename,
  onSave,
  onClose,
}: {
  name: string;
  filename: string;
  onSave: (name: string, filename: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [nextName, setName] = useState(name);
  const [nextFilename, setFilename] = useState(filename);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="export-dialog rename-dialog"
      aria-label="Rename workflow"
      onCancel={onClose}
    >
      <header>
        <h2>Rename workflow</h2>
        <button aria-label="Close rename" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onSave(nextName, nextFilename);
            onClose();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Unable to rename this workflow.",
            );
          }
        }}
      >
        <div className="rename-fields">
          <label>
            Workflow name
            <input
              autoFocus
              required
              value={nextName}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            YAML filename
            <input
              required
              maxLength={240}
              value={nextFilename}
              onChange={(event) => setFilename(event.target.value)}
            />
          </label>
          <p>
            The name is saved in your YAML. The filename is used when you export
            a copy.
          </p>
          {error && <p role="alert">{error}</p>}
        </div>
        <footer>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button black" type="submit">
            Save name
          </button>
        </footer>
      </form>
    </dialog>
  );
}
