import { useEffect, useRef, useState } from "react";
import type { Workflow } from "../workflow";
import { setCollectionUsage } from "./source-usage";
export function SourceUsageDialog({
  source,
  workflow,
  sourceId,
  onChange,
  onClose,
}: {
  source: string;
  workflow: Workflow;
  sourceId: string;
  onChange: (source: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [all, setAll] = useState(
      workflow.common_knowledge?.includes(sourceId) || false,
    ),
    [steps, setSteps] = useState(
      Object.entries(workflow.nodes)
        .filter(([, n]) => n.knowledge?.includes(sourceId))
        .map(([id]) => id),
    ),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="source-usage-dialog"
      aria-label="Collection usage"
      onCancel={onClose}
    >
      <header>
        <h2>Collection usage</h2>
        <button aria-label="Close usage" onClick={onClose}>
          ×
        </button>
      </header>
      <p>Choose where {sourceId} is available to retrieval.</p>
      <label>
        <input
          type="radio"
          name="usage"
          checked={all}
          onChange={() => setAll(true)}
        />
        All steps
      </label>
      <label>
        <input
          type="radio"
          name="usage"
          checked={!all}
          onChange={() => setAll(false)}
        />
        Selected steps
      </label>
      {!all && (
        <fieldset>
          {Object.entries(workflow.nodes).map(([id, node]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={steps.includes(id)}
                onChange={(e) =>
                  setSteps(
                    e.target.checked
                      ? [...steps, id]
                      : steps.filter((s) => s !== id),
                  )
                }
              />
              {node.title || id}
            </label>
          ))}
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          className="button black"
          onClick={() => {
            try {
              onChange(
                setCollectionUsage(
                  source,
                  sourceId,
                  all ? { kind: "all" } : { kind: "steps", stepIds: steps },
                ),
              );
              onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply usage
        </button>
      </footer>
    </dialog>
  );
}
