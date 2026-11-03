import { Select } from "./ui/Select";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Code2, Expand, Undo2, X } from "lucide-react";
import { type Workflow } from "./workflow";
import type { EdgeSelection } from "./studio-editing";
import { branchLabel } from "./graph";
import { applyTransaction } from "./studio/yaml-edits";
import { createRoute } from "./studio/editor-commands";
import { ActionInspector } from "./studio/ActionInspector";
import { RouteInspector } from "./studio/RouteInspector";
import { StepComposer } from "./studio/StepComposer";
import { predicateFields } from "./studio/PredicateEditor";
import type { DocumentTransaction } from "./studio/types";
import type { ToolManifest } from "./studio/tool-manifest";
export type Selection =
  { kind: "step"; id: string } | ({ kind: "edge" | "insert" } & EdgeSelection);
export default function StepInspector({
  source,
  workflow,
  selection,
  onSelect,
  onChange,
  onClose,
  onYaml,
  onUndo,
  canUndo,
  readOnly,
  tools = [],
  onTransaction,
  onHistoryEnd,
  onSources,
}: {
  source: string;
  workflow: Workflow;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (s: string, group?: string) => void;
  onClose: () => void;
  onYaml: () => void;
  onUndo: () => void;
  canUndo: boolean;
  readOnly: boolean;
  tools?: ToolManifest[];
  onTransaction?: (tx: DocumentTransaction) => void;
  onHistoryEnd?: () => void;
  onSources?: (id: string) => void;
}) {
  const [error, setError] = useState(""),
    [tab, setTab] = useState("exits"),
    [wide, setWide] = useState(false),
    [adding, setAdding] = useState(false);
  const [routeId, setRouteId] = useState(""),
    [target, setTarget] = useState(""),
    [rule, setRule] = useState("");
  const wideDialog = useRef<HTMLDialogElement>(null),
    panel = useRef<HTMLElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const id = selection.kind === "step" ? selection.id : selection.source,
    node = workflow.nodes[id];
  const edge =
    selection.kind !== "step"
      ? node?.edges?.find((e) => e.id === selection.edgeId)
      : undefined;
  useEffect(() => {
    returnFocus.current =
      window.document.activeElement instanceof HTMLElement
        ? window.document.activeElement
        : null;
    panel.current
      ?.querySelector<HTMLElement>("input,textarea,select,button")
      ?.focus();
    return () => {
      onHistoryEnd?.();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, []);
  useEffect(() => {
    if (wide) wideDialog.current?.showModal();
    else wideDialog.current?.close();
  }, [wide]);
  if (!node || (selection.kind !== "step" && !edge)) return null;
  function commit(tx: DocumentTransaction) {
    if (readOnly) return;
    try {
      if (onTransaction) onTransaction(tx);
      else onChange(applyTransaction(source, tx).source, tx.historyGroup);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const change = (key: string, value: unknown, group?: string) =>
    commit({
      label: `Edit ${node.title || id}`,
      historyGroup: group,
      operations: [{ op: "set", path: ["nodes", id, key], value }],
    });
  const incoming = Object.entries(workflow.nodes).flatMap(([source, n]) =>
    (n.edges || [])
      .filter((e) => e.to === id)
      .map((e) => ({ source, edge: e })),
  );
  const fields = [
    ...new Set((node.edges || []).flatMap((e) => predicateFields(e.predicate))),
  ];
  const promptKey = node.kind === "say" ? "text" : "prompt",
    prompt = node.kind === "say" ? node.text || "" : node.prompt || "",
    group = `step:${id}:${promptKey}`;
  const sources = [
    ...new Set([
      ...(workflow.common_knowledge || []),
      ...(node.knowledge || []),
    ]),
  ];
  return (
    <aside
      ref={panel}
      className="studio-inspector"
      aria-label={
        selection.kind === "step"
          ? "Edit step"
          : selection.kind === "edge"
            ? "Edit route"
            : "Insert step"
      }
      onKeyDown={(e) => {
        if (e.key === "Escape" && !wide) {
          e.stopPropagation();
          onClose();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          onHistoryEnd?.();
      }}
    >
      <header className="studio-inspector-header">
        <div className="inspector-eyebrow">
          {selection.kind === "step"
            ? node.kind
            : selection.kind === "edge"
              ? "Route"
              : "Insert step"}
          <button aria-label="Close inspector" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {selection.kind === "step" ? (
          <input
            className="step-title-input"
            aria-label="Step name"
            value={node.title || ""}
            placeholder={id}
            disabled={readOnly}
            onChange={(e) =>
              change("title", e.target.value, `step:${id}:title`)
            }
            onBlur={onHistoryEnd}
          />
        ) : (
          <h2>
            {selection.kind === "edge" ? branchLabel(edge!) : "Add to workflow"}
          </h2>
        )}
        {selection.kind !== "step" && <p>From {node.title || id}</p>}
      </header>
      <div className="studio-inspector-scroll">
        {readOnly && (
          <p className="inspector-notice">
            Showing the running snapshot. Stop the test to edit.
          </p>
        )}
        {error && (
          <p className="inspector-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={readOnly}>
          {selection.kind === "insert" ? (
            <StepComposer
              source={source}
              workflow={workflow}
              route={selection}
              tools={tools}
              onCancel={onClose}
              onCommit={(next, nodeId) => {
                onChange(next);
                onSelect({ kind: "step", id: nodeId });
              }}
            />
          ) : selection.kind === "edge" ? (
            <RouteInspector
              source={source}
              workflow={workflow}
              route={selection}
              tools={tools}
              onTransaction={commit}
            />
          ) : (
            <>
              {(node.kind === "conversation" || node.kind === "say") && (
                <section>
                  <div className="inspector-section-heading">
                    <h3>{node.kind === "say" ? "Exact message" : "Prompt"}</h3>
                    <button
                      className="inspector-link"
                      aria-label="Expand prompt editor"
                      onClick={() => setWide(true)}
                    >
                      <Expand size={14} /> Expand
                    </button>
                  </div>
                  <textarea
                    aria-label="Step prompt"
                    className="step-prompt"
                    rows={8}
                    value={prompt}
                    onChange={(e) => change(promptKey, e.target.value, group)}
                    onBlur={onHistoryEnd}
                  />
                  <p className="inspector-help">
                    {node.kind === "say"
                      ? "Spoken exactly, then continues automatically."
                      : "Changes apply to the draft as you type. Routes determine when to leave this step."}
                  </p>
                </section>
              )}
              {node.kind === "action" && (
                <ActionInspector
                  workflow={workflow}
                  nodeId={id}
                  tools={tools}
                  onTransaction={commit}
                />
              )}
              {node.kind === "end" && (
                <section>
                  <p>This step ends the conversation.</p>
                </section>
              )}
              <section className="inspector-divider">
                <div className="inspector-subtabs">
                  <button
                    className={tab === "exits" ? "selected" : ""}
                    onClick={() => setTab("exits")}
                  >
                    Exits {node.edges?.length || 0}
                  </button>
                  <button
                    className={tab === "incoming" ? "selected" : ""}
                    onClick={() => setTab("incoming")}
                  >
                    Incoming {incoming.length}
                  </button>
                </div>
                {tab === "exits" ? (
                  <>
                    {(node.edges || []).map((e) => (
                      <div key={e.id} className="inspector-transition">
                        <button
                          onClick={() =>
                            onSelect({ kind: "edge", source: id, edgeId: e.id })
                          }
                        >
                          <span>{branchLabel(e)}</span>
                          <strong>
                            <ArrowRight size={14} />
                            {workflow.nodes[e.to]?.title || e.to}
                          </strong>
                        </button>
                        {e.timing !== "before_action" && (
                          <button
                            className="inspector-link"
                            onClick={() =>
                              onSelect({
                                kind: "insert",
                                source: id,
                                edgeId: e.id,
                              })
                            }
                          >
                            + Insert step
                          </button>
                        )}
                      </div>
                    ))}
                    {node.kind !== "end" && node.kind !== "say" && (
                      <button
                        className="inspector-link"
                        onClick={() => setAdding(!adding)}
                      >
                        + Add route
                      </button>
                    )}
                    {adding && (
                      <div className="new-route-form">
                        <label>
                          Route ID
                          <input
                            value={routeId}
                            onChange={(e) => setRouteId(e.target.value)}
                          />
                        </label>
                        <label>
                          Destination
                          <Select
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                          >
                            <option value="">Choose step…</option>
                            {Object.entries(workflow.nodes).map(([id, n]) => (
                              <option key={id} value={id}>
                                {n.title || id}
                              </option>
                            ))}
                          </Select>
                        </label>
                        {node.kind === "action" ? (
                          <label>
                            Action result
                            <Select
                              value={rule}
                              onChange={(e) => setRule(e.target.value)}
                            >
                              <option value="">Choose result…</option>
                              {tools
                                .find((t) => t.name === node.tool)
                                ?.results.map((r) => (
                                  <option key={r}>{r}</option>
                                ))}
                            </Select>
                          </label>
                        ) : (
                          <label>
                            Continue when
                            <textarea
                              value={rule}
                              onChange={(e) => setRule(e.target.value)}
                            />
                          </label>
                        )}
                        <button
                          className="button"
                          onClick={() => {
                            try {
                              onChange(
                                createRoute(source, id, {
                                  id: routeId,
                                  to: target,
                                  ...(node.kind === "action"
                                    ? { result: rule }
                                    : { condition: rule }),
                                }),
                              );
                              setAdding(false);
                              setError("");
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Create route
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  incoming.map(({ source, edge }) => (
                    <div
                      className="inspector-transition"
                      key={JSON.stringify([source, edge.id])}
                    >
                      <button
                        onClick={() =>
                          onSelect({ kind: "edge", source, edgeId: edge.id })
                        }
                      >
                        <span>{workflow.nodes[source].title || source}</span>
                        <strong>{branchLabel(edge)}</strong>
                      </button>
                    </div>
                  ))
                )}
              </section>
              <section>
                <h3>Sources · {sources.length}</h3>
                <p className="inspector-help">
                  {sources.length
                    ? sources.map((s) => s).join(", ")
                    : "No collections attached."}
                </p>
                <button
                  className="inspector-link"
                  onClick={() => onSources?.(id)}
                >
                  Manage source usage →
                </button>
              </section>
              {!!fields.length && (
                <section>
                  <h3>Fields checked here</h3>
                  <p className="inspector-help">{fields.join(", ")}</p>
                </section>
              )}
              <details className="inspector-advanced">
                <summary>Advanced</summary>
                <p className="inspector-help">
                  Step ID: <code>{id}</code>
                </p>
                {node.kind === "conversation" && (
                  <>
                    <label className="inspector-check">
                      <input
                        type="checkbox"
                        checked={node.patient || false}
                        onChange={(e) => change("patient", e.target.checked)}
                      />
                      Allow more time for the caller
                    </label>
                    <label>
                      On entering this step
                      <Select
                        value={node.entry || "wait"}
                        onChange={(e) => change("entry", e.target.value)}
                      >
                        <option value="wait">Wait for the caller</option>
                        <option value="respond">Respond immediately</option>
                      </Select>
                    </label>
                    <label>
                      Exact readback template
                      <textarea
                        value={node.readback || ""}
                        onChange={(e) =>
                          change(
                            "readback",
                            e.target.value,
                            `step:${id}:readback`,
                          )
                        }
                      />
                    </label>
                    <p className="inspector-help">
                      Readbacks require Respond immediately and plain configured
                      field names in braces.
                    </p>
                  </>
                )}
                <button className="inspector-link" onClick={onYaml}>
                  Edit all properties in YAML ↗
                </button>
              </details>
            </>
          )}
        </fieldset>
      </div>
      <footer className="studio-inspector-footer">
        <span>Draft · edits stay local</span>
        <button
          className="inspector-link"
          disabled={!canUndo || readOnly}
          onClick={onUndo}
        >
          <Undo2 size={13} />
          Undo
        </button>
        <button className="inspector-yaml" onClick={onYaml}>
          <Code2 size={13} />
          YAML
        </button>
      </footer>
      <dialog
        className="wide-prompt-dialog"
        ref={wideDialog}
        onCancel={() => setWide(false)}
      >
        <header>
          <h2>{node.title || id} · Prompt</h2>
          <button aria-label="Close wide editor" onClick={() => setWide(false)}>
            <X size={18} />
          </button>
        </header>
        <textarea
          aria-label="Expanded step prompt"
          value={prompt}
          disabled={readOnly}
          onChange={(e) => change(promptKey, e.target.value, group)}
          onBlur={onHistoryEnd}
        />
        <footer>
          Edits update the draft as you type.
          <button className="button black" onClick={() => setWide(false)}>
            Done
          </button>
        </footer>
      </dialog>
    </aside>
  );
}
