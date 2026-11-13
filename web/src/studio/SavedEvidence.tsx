import "./saved-evidence.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, FileSearch, FolderOpen, X } from "lucide-react";
import { Select } from "../ui/Select";
import { readWorkflow } from "../workflow";
import { fingerprint } from "./project-files";
import { humanizeId } from "./workflow-model";
import {
  parseEvidence,
  replayState,
  type EvidenceBundle,
} from "./saved-evidence";

export function SavedEvidence({
  source,
  disabled,
  onStep,
}: {
  source: string;
  disabled: boolean;
  onStep: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <>
      <button
        ref={trigger}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Inspect an offline scenario export"
      >
        <FileSearch size={15} /> Open saved test
      </button>
      {open &&
        createPortal(
          <SavedEvidenceDialog
            source={source}
            onClose={close}
            onStep={onStep}
          />,
          document.body,
        )}
    </>
  );
}

function SavedEvidenceDialog({
  source,
  onClose,
  onStep,
}: {
  source: string;
  onClose: () => void;
  onStep: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const loadId = useRef(0);
  const [bundle, setBundle] = useState<EvidenceBundle | null>(null);
  const [runIndex, setRunIndex] = useState(0),
    [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [hash, setHash] = useState({ source: "", value: "" });
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      loadId.current += 1;
      element?.close();
    };
  }, []);
  useEffect(() => {
    let active = true;
    void fingerprint(new TextEncoder().encode(source))
      .then((value) => {
        if (active) setHash({ source, value });
      })
      .catch(() => {
        if (active) setHash({ source, value: "" });
      });
    return () => {
      active = false;
    };
  }, [source]);
  const run = bundle?.runs[runIndex];
  const event = run?.timeline[index];
  const replay = run ? replayState(run, index) : null;
  const workflow = readWorkflow(source);
  const matches =
    !!run &&
    hash.source === source &&
    hash.value === run.context.workflow_sha256;
  const target =
    typeof event?.details.node === "string"
      ? event.details.node
      : replay?.stage;
  const canReveal =
    matches && target && workflow && Object.hasOwn(workflow.nodes, target);
  const stepName = (id: string) =>
    matches && workflow && Object.hasOwn(workflow.nodes, id)
      ? workflow.nodes[id].title || id
      : humanizeId(id);
  const choose = async (file?: File) => {
    if (!file) return;
    const current = ++loadId.current;
    try {
      if (file.size > 5_000_000)
        throw new Error("Evidence files must be smaller than 5 MB.");
      const parsed = parseEvidence(await file.text());
      if (loadId.current !== current) return;
      setBundle(parsed);
      setRunIndex(0);
      setIndex(0);
      setError("");
    } catch (error) {
      if (loadId.current === current) setError((error as Error).message);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="saved-evidence-dialog"
      aria-label="Saved test evidence"
      onCancel={onClose}
    >
      <header>
        <div>
          <span className="saved-evidence-badge">
            Replay · saved scripted test
          </span>
          <h2>Saved test evidence</h2>
        </div>
        <div className="saved-evidence-header-actions">
          <button className="button" onClick={() => input.current?.click()}>
            <FolderOpen size={15} /> Open evidence JSON
          </button>
          <button aria-label="Close saved evidence" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          aria-label="Evidence JSON file"
          hidden
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </header>
      {error && (
        <p className="saved-evidence-error" role="alert">
          {error}
        </p>
      )}
      {run && replay ? (
        <>
          <section className="saved-evidence-run">
            <label>
              Scenario
              <Select
                aria-label="Saved scenario"
                value={String(runIndex)}
                onChange={(event) => {
                  setRunIndex(Number(event.target.value));
                  setIndex(0);
                }}
              >
                {bundle!.runs.map((item, i) => (
                  <option key={i} value={String(i)}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <span className={run.passed ? "saved-pass" : "saved-fail"}>
              {run.passed ? "Passed" : "Failed"}
            </span>
            <p>
              {matches
                ? "Matches the open YAML"
                : "The open YAML differs from this saved test."}
            </p>
          </section>
          <div className="saved-evidence-body">
            <nav aria-label="Saved events">
              <h3>Event sequence</h3>
              {run.timeline.length ? (
                run.timeline.map((item, i) => (
                  <button
                    key={item.sequence}
                    aria-current={index === i ? "step" : undefined}
                    onClick={() => setIndex(i)}
                  >
                    <span>{item.sequence}</span>
                    <span>{humanizeId(item.type)}</span>
                  </button>
                ))
              ) : (
                <p>No saved events.</p>
              )}
            </nav>
            <section
              className="saved-evidence-detail"
              aria-label="Saved event details"
            >
              <div className="saved-evidence-step">
                <div>
                  <small>Step at this event</small>
                  <h3>{stepName(target || replay.stage)}</h3>
                </div>
                <button
                  className="button"
                  disabled={!canReveal}
                  onClick={() => {
                    if (canReveal && target) {
                      onClose();
                      onStep(target);
                    }
                  }}
                >
                  Show step in workflow
                </button>
              </div>
              {event && (
                <article>
                  <h3>{humanizeId(event.type)}</h3>
                  {typeof event.details.code === "string" && (
                    <code className="saved-reason-code">
                      {event.details.code}
                    </code>
                  )}
                  {typeof event.details.reason === "string" && (
                    <p>{event.details.reason}</p>
                  )}
                  {typeof event.details.policy === "string" && (
                    <p>
                      Confirmation rule: <code>{event.details.policy}</code>
                    </p>
                  )}
                  <details>
                    <summary>Original projected event</summary>
                    <pre>{JSON.stringify(event, null, 2)}</pre>
                  </details>
                </article>
              )}
              <article>
                <h3>Collected data at this event</h3>
                {Object.keys(replay.facts).length ? (
                  <dl>
                    {Object.entries(replay.facts).map(([key, value]) => (
                      <div key={key}>
                        <dt>{humanizeId(key)}</dt>
                        <dd>{value === null ? "Unknown" : String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>No collected values in this saved state.</p>
                )}
              </article>
              {!run.passed && (
                <article className="saved-evidence-failures">
                  <h3>Failed checks</h3>
                  <ul>
                    {run.failures.map((failure, i) => (
                      <li key={i}>{failure}</li>
                    ))}
                  </ul>
                </article>
              )}
              <article>
                <h3>Final test outcome</h3>
                <p>
                  {run.actions.length} simulated action receipt
                  {run.actions.length === 1 ? "" : "s"} ·{" "}
                  {run.completed
                    ? "Conversation completed"
                    : "Conversation not completed"}
                </p>
                {run.actions.map((action, i) => (
                  <details key={i}>
                    <summary>
                      {action.tool} · {action.status} · {action.request}
                    </summary>
                    <pre>{JSON.stringify(action, null, 2)}</pre>
                  </details>
                ))}
              </article>
              <details className="saved-evidence-provenance">
                <summary>Reproducibility and redaction</summary>
                <dl>
                  <div>
                    <dt>Workflow SHA-256</dt>
                    <dd>{run.context.workflow_sha256}</dd>
                  </div>
                  <div>
                    <dt>Libretto</dt>
                    <dd>
                      {run.context.libretto_version || "Unavailable"} · schema{" "}
                      {run.context.yaml_schema_version}
                    </dd>
                  </div>
                  <div>
                    <dt>Source commit</dt>
                    <dd>
                      {run.context.libretto_commit || "Unavailable"}
                      {run.context.source_dirty
                        ? " · local changes present"
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Redacted fields</dt>
                    <dd>
                      {run.context.redacted_fields.join(", ") ||
                        "None designated"}
                    </dd>
                  </div>
                </dl>
                <pre>
                  {JSON.stringify(
                    { models: run.context.models, speech: run.context.speech },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </section>
          </div>
          <footer>
            <p>Read-only replay. No audio, providers or tools are started.</p>
            <div>
              <button
                className="button"
                aria-label="Previous event"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ArrowLeft size={14} /> Previous
              </button>
              <span>
                {run.timeline.length ? index + 1 : 0} / {run.timeline.length}
              </span>
              <button
                className="button"
                aria-label="Next event"
                disabled={index >= run.timeline.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                Next <ArrowRight size={14} />
              </button>
            </div>
          </footer>
        </>
      ) : (
        <section className="saved-evidence-empty">
          <FileSearch size={32} />
          <h3>Inspect a local scenario run</h3>
          <p>Export a test from your terminal, then open its JSON file here.</p>
          <pre>libretto test examples/scenarios --output evidence.json</pre>
          <p>
            Saved evidence includes workflow state and projected events. It does
            not include transcripts or audio.
          </p>
        </section>
      )}
    </dialog>
  );
}
