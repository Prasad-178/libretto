import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
export function ControllerInstructions({
  value,
  disabled,
  onChange,
  onHistoryEnd,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onHistoryEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (expanded) {
      dialog.current?.showModal();
      input.current?.focus();
    } else dialog.current?.close();
  }, [expanded]);
  const close = () => {
    onHistoryEnd();
    dialog.current?.close();
    setExpanded(false);
    trigger.current?.focus();
  };
  return (
    <div className="controller-instructions">
      <div className="prompt-editor">
        <header>
          <label htmlFor="controller-guidance">Controller instructions</label>
          <button
            ref={trigger}
            disabled={disabled}
            aria-label="Expand controller instructions"
            onClick={() => setExpanded(true)}
          >
            Expand <ArrowUpRight size={14} />
          </button>
        </header>
        <textarea
          id="controller-guidance"
          rows={12}
          disabled={disabled}
          value={value}
          maxLength={5000}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onHistoryEnd}
        />
      </div>
      <p>
        Add guidance specific to this workflow. Built-in evidence, output and
        confirmation rules remain enforced.
      </p>
      <dialog
        ref={dialog}
        className="expanded-instructions"
        aria-label="Controller instructions editor"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => setExpanded(false)}
      >
        <header>
          <div>
            <h2>Stage controller instructions</h2>
            <p>
              Workflow-specific guidance · built-in authority rules remain
              enforced
            </p>
          </div>
          <button aria-label="Close controller instructions" onClick={close}>
            <X size={22} />
          </button>
        </header>
        <textarea
          ref={input}
          aria-label="Expanded controller instructions"
          disabled={disabled}
          value={value}
          maxLength={5000}
          onChange={(e) => onChange(e.target.value)}
        />
        <footer>
          <span>Edits update the draft as you type · Undo is available</span>
          <button className="button black" onClick={close}>
            Done
          </button>
        </footer>
      </dialog>
    </div>
  );
}
