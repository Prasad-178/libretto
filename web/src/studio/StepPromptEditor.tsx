import { useEffect, useRef, useState } from "react";
import { Expand, X } from "lucide-react";
export function StepPromptEditor({
  title,
  value,
  readback = false,
  literal = false,
  disabled,
  onChange,
  onHistoryEnd,
}: {
  title: string;
  value: string;
  readback?: boolean;
  literal?: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onHistoryEnd?: () => void;
}) {
  const [wide, setWide] = useState(false),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (wide) {
      dialog.current?.showModal();
      input.current?.focus();
    } else dialog.current?.close();
  }, [wide]);
  const close = () => {
    onHistoryEnd?.();
    dialog.current?.close();
    setWide(false);
    trigger.current?.focus();
  };
  const label = readback
    ? "Readback message"
    : literal
      ? "Exact message"
      : "Step prompt";
  return (
    <section className="step-prompt-editor">
      <div className="inspector-section-heading">
        <h3>{label}</h3>
        <button
          ref={trigger}
          disabled={disabled}
          className="inspector-link"
          aria-label="Expand prompt editor"
          onClick={() => setWide(true)}
        >
          <Expand size={14} />
          Expand
        </button>
      </div>
      <textarea
        aria-label={readback ? "Readback message" : "Step prompt"}
        className="step-prompt"
        rows={8}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onHistoryEnd}
      />
      <p className="inspector-help">
        {readback
          ? "The runtime fills {field_id} placeholders with current facts. Changes must include every protected detail before testing."
          : literal
            ? "Spoken exactly, then continues automatically."
            : "Added to the agent’s shared instructions for this step. Connections determine when it leaves."}
      </p>
      <dialog
        className="wide-prompt-dialog"
        ref={dialog}
        aria-label="Expanded step prompt editor"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => setWide(false)}
      >
        <header>
          <div>
            <h2>
              {title} · {label}
            </h2>
            <p>Updates the draft as you type</p>
          </div>
          <button aria-label="Close wide editor" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <textarea
          ref={input}
          aria-label="Expanded step prompt"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onHistoryEnd}
        />
        <footer>
          <span>Undo is available</span>
          <button className="button black" onClick={close}>
            Done
          </button>
        </footer>
      </dialog>
    </section>
  );
}
