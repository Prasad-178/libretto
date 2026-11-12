import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { X } from "lucide-react";
import { readWorkflow } from "../workflow";
import { applyTransaction } from "./yaml-edits";
import { validateSettingsChanges } from "./settings-edits";
import type { DocumentTransaction, StudioMetadata } from "./types";

/** Staged form edits join the authoritative document as one transaction on Save. */
export function useSettingsDraft(source: string, metadata: StudioMetadata) {
  const base = useRef({ source, metadata });
  const pending = useRef(new Set<string>());
  const current = useRef({
    source,
    metadata,
    operations: [] as DocumentTransaction["operations"],
  });
  const [draft, setDraft] = useState(current.current);
  const [error, setError] = useState("");
  const workflow = useMemo(() => readWorkflow(draft.source)!, [draft.source]);
  const apply = (transaction: DocumentTransaction) => {
    try {
      const nextSource = applyTransaction(
        current.current.source,
        transaction,
      ).source;
      if (!readWorkflow(nextSource))
        throw new Error(
          "This edit exceeds supported size or breaks the form structure. Your current draft was preserved.",
        );
      const next = {
        source: nextSource,
        metadata: transaction.metadata || current.current.metadata,
        operations: [...current.current.operations, ...transaction.operations],
      };
      current.current = next;
      setDraft(next);
      setError("");
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  };
  const set = (path: (string | number)[], value: unknown) =>
    apply({ label: "Edit settings", operations: [{ op: "set", path, value }] });
  const save = (
    label: string,
    commit: (transaction: DocumentTransaction) => void,
  ) => {
    if (pending.current.has("action-configuration"))
      throw new Error("Apply action configuration before saving the step.");
    if (pending.current.size)
      throw new Error("Apply or cancel the pending ID rename before saving.");
    if (source !== base.current.source || metadata !== base.current.metadata)
      throw new Error(
        "The document changed while this dialog was open. Close and reopen settings before saving.",
      );
    const staged = current.current;
    validateSettingsChanges(
      base.current.source,
      staged.source,
      staged.operations,
    );
    if (staged.operations.length)
      commit({
        label,
        operations: staged.operations,
        ...(staged.metadata !== base.current.metadata
          ? { metadata: staged.metadata }
          : {}),
      });
  };
  return {
    ...draft,
    workflow,
    apply,
    set,
    save,
    error,
    setError,
    markPending: (key: string, active: boolean) => {
      if (active) pending.current.add(key);
      else pending.current.delete(key);
    },
  };
}
export type SettingsDraft = ReturnType<typeof useSettingsDraft>;

export function SettingsDialog({
  title,
  description,
  label,
  saveLabel,
  error,
  onSave,
  onClose,
  children,
  viewKey,
}: {
  title: string;
  description: string;
  label: string;
  saveLabel: string;
  error: string;
  onSave: () => void;
  onClose: () => void;
  children: ReactNode;
  viewKey?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousView = useRef(viewKey);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  useEffect(() => {
    if (previousView.current === viewKey) return;
    previousView.current = viewKey;
    const body = dialog.current?.querySelector<HTMLElement>(
      ".settings-dialog-body",
    );
    if (body) {
      body.scrollTop = 0;
      body
        .querySelector<HTMLElement>("button,input,textarea,[role=combobox]")
        ?.focus();
    }
  }, [viewKey]);
  useEffect(() => {
    if (error)
      dialog.current
        ?.querySelector('[role="alert"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [error]);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      data-settings-kind={label === "Workflow settings" ? "workflow" : "step"}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button aria-label="Close settings" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="settings-dialog-body">
          {error && (
            <p className="settings-dialog-error" role="alert">
              {error}
            </p>
          )}
          {children}
        </div>
        <footer>
          <span>Changes apply together when you save.</span>
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button black" type="submit">
            {saveLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function Choices({
  legend,
  values,
  selected,
  onChange,
}: {
  legend: string;
  values: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="settings-choices">
      <legend>{legend}</legend>
      {[...new Set([...values, ...selected])].map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, id]
                  : selected.filter((value) => value !== id),
              )
            }
          />
          <span>
            {friendlyName(id)} <small>{id}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
export const friendlyName = (id: string) => {
  const text = id.replaceAll("_", " ").replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
