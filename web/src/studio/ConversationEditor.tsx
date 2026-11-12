import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { Workflow } from "../workflow";
import { voiceEngine, voicePresets } from "../voice-config";
import { Select } from "../ui/Select";

type Change = (
  path: (string | number)[],
  value: unknown,
  group?: string,
) => void;

/** A view of the document, not another copy of its editable state. */
export function ConversationEditor({
  workflow,
  disabled,
  change,
  onHistoryEnd,
  onSection,
  onWorkflow,
}: {
  workflow: Workflow;
  disabled: boolean;
  change: Change;
  onHistoryEnd: () => void;
  onSection: (section: string) => void;
  onWorkflow: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const expandedInput = useRef<HTMLTextAreaElement>(null);
  const speech = workflow.speech || voicePresets.livekit;
  useEffect(() => {
    if (expanded) {
      dialog.current?.showModal();
      expandedInput.current?.focus();
    } else dialog.current?.close();
  }, [expanded]);
  const close = () => {
    onHistoryEnd();
    dialog.current?.close();
    setExpanded(false);
    expandButton.current?.focus();
  };
  const updateInstructions = (value: string) =>
    change(["shared_prompt"], value, "settings:shared-prompt");
  return (
    <div className="conversation-layout">
      <div className="conversation-form">
        <label className="agent-name">
          Agent name
          <input
            value={workflow.name}
            disabled={disabled}
            onChange={(event) =>
              change(["name"], event.target.value, "settings:name")
            }
            onBlur={onHistoryEnd}
          />
        </label>
        <div className="instructions-editor">
          <div className="instructions-toolbar">
            <label htmlFor="shared-instructions">Instructions</label>
            <span>Applies to every step</span>
            <button
              ref={expandButton}
              aria-label="Expand instructions"
              onClick={() => setExpanded(true)}
            >
              Expand <ArrowUpRight size={14} />
            </button>
          </div>
          <textarea
            id="shared-instructions"
            aria-label="Shared instructions"
            disabled={disabled}
            value={workflow.shared_prompt}
            onChange={(event) => updateInstructions(event.target.value)}
            onBlur={onHistoryEnd}
          />
        </div>
        <div className="first-message-editor">
          <div>
            <label htmlFor="first-message">First message</label>
            <span>Spoken once when a test starts</span>
          </div>
          <textarea
            id="first-message"
            aria-label="First message"
            rows={3}
            disabled={disabled}
            value={workflow.welcome || ""}
            onChange={(event) =>
              change(["welcome"], event.target.value, "settings:welcome")
            }
            onBlur={onHistoryEnd}
          />
          <p>Leave empty to let the caller speak first.</p>
        </div>
        <details className="conversation-details">
          <summary>Workflow details</summary>
          <label>
            What does it help with?
            <textarea
              disabled={disabled}
              value={workflow.description || ""}
              onChange={(event) =>
                change(
                  ["description"],
                  event.target.value,
                  "settings:description",
                )
              }
              onBlur={onHistoryEnd}
            />
            <span className="settings-helper">
              For your reference; doesn’t affect agent behaviour.
            </span>
          </label>
          <label>
            Conversation starts at
            <Select
              disabled={disabled}
              value={workflow.start}
              onChange={(event) => change(["start"], event.target.value)}
            >
              {Object.entries(workflow.nodes).map(([id, node]) => (
                <option key={id} value={id}>
                  {node.title || id}
                </option>
              ))}
            </Select>
          </label>
        </details>
        <p className="conversation-footnote">
          Changes stay in this browser. Export YAML to use them in your
          application.
        </p>
      </div>
      <aside
        className="conversation-context"
        aria-label="Agent configuration summary"
      >
        <h3>Model &amp; voice</h3>
        <dl>
          <div>
            <dt>Response model</dt>
            <dd>{workflow.models?.speaker || "google/gemini-3.5-flash"}</dd>
          </div>
          <div>
            <dt>Voice</dt>
            <dd>
              {speech.tts?.provider} · {speech.tts?.model}
            </dd>
          </div>
          <div>
            <dt>Speech engine</dt>
            <dd>
              {voiceEngine(workflow.speech) === "livekit"
                ? "LiveKit Agents"
                : "Direct Deepgram"}
            </dd>
          </div>
        </dl>
        <button onClick={() => onSection("models")}>Model settings →</button>
        <button onClick={() => onSection("controller")}>
          Stage controller instructions →
        </button>
        <button onClick={() => onSection("speech")}>Speech settings →</button>
        <div className="conversation-tip">
          <h3>One set of instructions</h3>
          <p>
            Use this space for your agent’s role and boundaries. Add
            task-specific prompts to individual workflow steps.
          </p>
          <button onClick={onWorkflow}>Open workflow →</button>
        </div>
      </aside>
      <dialog
        ref={dialog}
        className="expanded-instructions"
        aria-labelledby="expanded-instructions-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => setExpanded(false)}
      >
        <header>
          <div>
            <h2 id="expanded-instructions-title">Instructions</h2>
            <p>Applied throughout the conversation</p>
          </div>
          <button aria-label="Close instructions" onClick={close}>
            <X size={22} />
          </button>
        </header>
        <textarea
          ref={expandedInput}
          aria-label="Expanded shared instructions"
          disabled={disabled}
          value={workflow.shared_prompt}
          onChange={(event) => updateInstructions(event.target.value)}
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
