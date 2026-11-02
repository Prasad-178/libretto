import { useState } from "react";
import {
  ArrowRight,
  Check,
  Code2,
  MessageSquare,
  Volume2,
  Wrench,
  X,
  Undo2,
  ChevronRight,
} from "lucide-react";
import { branchLabel } from "./graph";
import { type Workflow } from "./workflow";
import {
  editEdge,
  editValue,
  insertStep,
  type EdgeSelection,
  type StepKind,
} from "./studio-editing";
export type Selection =
  { kind: "step"; id: string } | ({ kind: "edge" | "insert" } & EdgeSelection);
const pretty = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
type Predicate = {
  op: string;
  field?: string;
  value?: string | boolean | null;
  conditions?: Predicate[];
};
function PredicateEditor({
  value,
  fields,
  onChange,
}: {
  value: Predicate;
  fields: NonNullable<Workflow["fields"]>;
  onChange: (v: Predicate) => void;
}) {
  const first = Object.keys(fields)[0] || "";
  return (
    <div className="predicate-editor">
      <select
        aria-label="Check type"
        value={value.op}
        onChange={(e) =>
          onChange(
            ["all", "any", "not"].includes(e.target.value)
              ? {
                  op: e.target.value,
                  conditions: [{ op: "exists", field: first }],
                }
              : {
                  op: e.target.value,
                  field: first,
                  ...(e.target.value === "equals"
                    ? { value: fields[first]?.type === "boolean" ? true : "" }
                    : {}),
                },
          )
        }
      >
        <option value="exists">Information is collected</option>
        <option value="equals">Information equals a value</option>
        <option value="all">All checks pass</option>
        <option value="any">Any check passes</option>
        <option value="not">Check does not pass</option>
      </select>
      {["exists", "equals"].includes(value.op) ? (
        <>
          <select
            aria-label="Information field"
            value={value.field}
            onChange={(e) =>
              onChange({
                ...value,
                field: e.target.value,
                ...(value.op === "equals"
                  ? {
                      value:
                        fields[e.target.value]?.type === "boolean" ? true : "",
                    }
                  : {}),
              })
            }
          >
            {Object.keys(fields).map((id) => (
              <option key={id} value={id}>
                {pretty(id)}
              </option>
            ))}
          </select>
          {value.op === "equals" &&
            (fields[value.field || ""]?.type === "boolean" ? (
              <select
                aria-label="Expected value"
                value={String(value.value)}
                onChange={(e) =>
                  onChange({ ...value, value: e.target.value === "true" })
                }
              >
                <option value="true">Yes / confirmed</option>
                <option value="false">No / not confirmed</option>
              </select>
            ) : (
              <input
                aria-label="Expected value"
                value={String(value.value ?? "")}
                onChange={(e) => onChange({ ...value, value: e.target.value })}
              />
            ))}
        </>
      ) : (
        <div className="predicate-children">
          {value.conditions?.map((c, i) => (
            <div key={i}>
              <PredicateEditor
                value={c}
                fields={fields}
                onChange={(v) =>
                  onChange({
                    ...value,
                    conditions: value.conditions!.map((old, j) =>
                      i === j ? v : old,
                    ),
                  })
                }
              />
              {value.op !== "not" && value.conditions!.length > 1 && (
                <button
                  className="inspector-link"
                  onClick={() =>
                    onChange({
                      ...value,
                      conditions: value.conditions!.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remove check
                </button>
              )}
            </div>
          ))}
          {value.op !== "not" && (
            <button
              className="inspector-link"
              disabled={!first}
              onClick={() =>
                onChange({
                  ...value,
                  conditions: [
                    ...(value.conditions || []),
                    { op: "exists", field: first },
                  ],
                })
              }
            >
              + Add check
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function predicateFields(p: unknown): string[] {
  if (!p || typeof p !== "object") return [];
  const v = p as Predicate;
  return [
    ...(v.field ? [v.field] : []),
    ...(v.conditions || []).flatMap(predicateFields),
  ];
}
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
}: {
  source: string;
  workflow: Workflow;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (s: string) => void;
  onClose: () => void;
  onYaml: () => void;
  onUndo: () => void;
  canUndo: boolean;
  readOnly: boolean;
}) {
  const [error, setError] = useState("");
  const [kind, setKind] = useState<StepKind>("conversation");
  const [tool, setTool] = useState("");
  const id = selection.kind === "step" ? selection.id : selection.source;
  const node = workflow.nodes[id];
  const edge =
    selection.kind !== "step"
      ? node?.edges?.find((e) => e.id === selection.edgeId)
      : undefined;
  if (!node || (selection.kind !== "step" && !edge)) return null;
  const tools = (workflow as Workflow & { tools?: string[] }).tools || [];
  function commit(fn: () => string) {
    try {
      onChange(fn());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not edit workflow.");
    }
  }
  const change = (key: string, value: unknown) =>
    commit(() => editValue(source, ["nodes", id, key], value));
  const changeEdge = (key: string, value: unknown) => {
    if (selection.kind !== "step")
      commit(() => editEdge(source, selection, key, value));
  };
  const collected = [
    ...new Set((node.edges || []).flatMap((e) => predicateFields(e.predicate))),
  ];
  return (
    <aside
      className="studio-inspector"
      aria-label={
        selection.kind === "step"
          ? "Edit step"
          : selection.kind === "edge"
            ? "Edit transition"
            : "Add a step"
      }
    >
      <header className="studio-inspector-header">
        <div className="inspector-eyebrow">
          {selection.kind === "step"
            ? "Edit step"
            : selection.kind === "edge"
              ? "Edit transition"
              : "Add to workflow"}
          <button aria-label="Close inspector" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {selection.kind === "step" ? (
          <>
            <input
              className="step-title-input"
              aria-label="Step name"
              value={node.title || ""}
              placeholder={id}
              disabled={readOnly}
              onChange={(e) => change("title", e.target.value)}
            />
            <p>{pretty(node.kind)} step</p>
          </>
        ) : (
          <>
            <h2>
              {selection.kind === "edge" ? "When to move on" : "Add a step"}
            </h2>
            <p>
              {selection.kind === "edge"
                ? `From: ${node.title || id}`
                : `Between ${node.title || id} and ${workflow.nodes[edge!.to]?.title || edge!.to}`}
            </p>
          </>
        )}
      </header>
      <div className="studio-inspector-scroll">
        {readOnly && (
          <p className="inspector-notice">
            Showing the running workflow. End this test to edit its steps.
          </p>
        )}
        {error && (
          <p className="inspector-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={readOnly}>
          {selection.kind === "step" ? (
            <>
              {node.kind === "conversation" || node.kind === "say" ? (
                <section>
                  <label htmlFor="step-prompt">
                    {node.kind === "say"
                      ? "What should the agent say?"
                      : "What should the agent do here?"}
                  </label>
                  <textarea
                    id="step-prompt"
                    className="step-prompt"
                    value={
                      node.kind === "say" ? node.text || "" : node.prompt || ""
                    }
                    onChange={(e) =>
                      change(
                        node.kind === "say" ? "text" : "prompt",
                        e.target.value,
                      )
                    }
                  />
                  <p className="inspector-help">
                    {node.kind === "say"
                      ? "This exact message is spoken before continuing."
                      : "Describe the goal. The agent handles the conversation."}
                  </p>
                </section>
              ) : node.kind === "action" ? (
                <section>
                  <label htmlFor="action-tool">Registered action</label>
                  <select
                    id="action-tool"
                    value={node.tool || ""}
                    onChange={(e) =>
                      commit(() => {
                        const template = Object.values(workflow.nodes).find(
                          (n) =>
                            n.kind === "action" && n.tool === e.target.value,
                        );
                        let next = editValue(
                          source,
                          ["nodes", id, "tool"],
                          e.target.value,
                        );
                        next = editValue(
                          next,
                          ["nodes", id, "arguments"],
                          template?.arguments || {},
                        );
                        return editValue(
                          next,
                          ["nodes", id, "requires"],
                          template?.requires || [],
                        );
                      })
                    }
                  >
                    {tools.map((t) => (
                      <option key={t} value={t}>
                        {pretty(t)}
                      </option>
                    ))}
                  </select>
                  <p className="inspector-help">
                    The runtime checks required information before running this
                    action.
                  </p>
                </section>
              ) : (
                <section>
                  <p>This step ends the conversation.</p>
                </section>
              )}
              {(collected.length > 0 || node.kind === "action") && (
                <section>
                  <div className="inspector-section-heading">
                    <h3>
                      {node.kind === "action"
                        ? "Required information"
                        : "Information checked before continuing"}
                    </h3>
                    {node.kind !== "action" && (
                      <button
                        className="inspector-link"
                        onClick={() => {
                          const e = node.edges.find((e) => e.predicate);
                          if (e)
                            onSelect({
                              kind: "edge",
                              source: id,
                              edgeId: e.id,
                            });
                        }}
                      >
                        Edit fields
                      </button>
                    )}
                  </div>
                  {node.kind === "action" ? (
                    Object.keys(workflow.fields || {}).map((f) => (
                      <label className="inspector-check" key={f}>
                        <input
                          type="checkbox"
                          checked={node.requires?.includes(f) || false}
                          onChange={(e) =>
                            change(
                              "requires",
                              e.target.checked
                                ? [...(node.requires || []), f]
                                : (node.requires || []).filter((k) => k !== f),
                            )
                          }
                        />
                        {pretty(f)}
                      </label>
                    ))
                  ) : (
                    <div className="field-chips">
                      {collected.map((f) => (
                        <span key={f}>{pretty(f)}</span>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {!!node.edges?.length && (
                <section className="inspector-divider">
                  <h3>What happens next</h3>
                  {node.edges.map((e) => (
                    <div className="inspector-transition" key={e.id}>
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
                        <ChevronRight
                          className="transition-chevron"
                          size={17}
                        />
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
                </section>
              )}
              <details className="inspector-advanced">
                <summary>Advanced settings</summary>
                <p className="inspector-help">Step ID: {id}</p>
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
                    <label htmlFor="entry-mode">On entering this step</label>
                    <select
                      id="entry-mode"
                      value={node.entry || "wait"}
                      onChange={(e) => change("entry", e.target.value)}
                    >
                      <option value="wait">Wait for the caller</option>
                      <option value="respond">Respond immediately</option>
                    </select>
                    <label htmlFor="readback">Exact readback template</label>
                    <textarea
                      id="readback"
                      value={node.readback || ""}
                      onChange={(e) => change("readback", e.target.value)}
                    />
                    <p className="inspector-help">
                      Readbacks require “Respond immediately”. Use configured
                      field names in braces.
                    </p>
                  </>
                )}
                {node.kind === "action" &&
                  Object.entries(node.arguments || {}).map(
                    ([argument, field]) => (
                      <label key={argument}>
                        {pretty(argument)}
                        <select
                          aria-label={`Argument ${argument}`}
                          value={field}
                          onChange={(e) =>
                            commit(() =>
                              editValue(
                                source,
                                ["nodes", id, "arguments", argument],
                                e.target.value,
                              ),
                            )
                          }
                        >
                          {Object.keys(workflow.fields || {}).map((f) => (
                            <option key={f} value={f}>
                              {pretty(f)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ),
                  )}
                {!!node.tools?.length && (
                  <p className="inspector-help">
                    Tools: {node.tools.join(", ")}
                  </p>
                )}
                {!!node.knowledge?.length && (
                  <p className="inspector-help">
                    Knowledge: {node.knowledge.join(", ")}
                  </p>
                )}
                <button className="inspector-link" onClick={onYaml}>
                  Edit all properties in YAML ↗
                </button>
              </details>
            </>
          ) : selection.kind === "edge" ? (
            <>
              <section>
                <label htmlFor="edge-condition">Continue when</label>
                <textarea
                  id="edge-condition"
                  className="transition-prompt"
                  value={edge!.condition || ""}
                  placeholder={
                    edge!.predicate
                      ? "State checks below determine this transition."
                      : "Describe when the agent should continue."
                  }
                  onChange={(e) => changeEdge("condition", e.target.value)}
                />
                <p className="inspector-help">
                  A language condition is evaluated by the agent. State checks
                  below must also pass.
                </p>
              </section>
              <section>
                <div className="inspector-section-heading">
                  <h3>Required checks</h3>
                  {!edge!.predicate && (
                    <button
                      className="inspector-link"
                      disabled={!Object.keys(workflow.fields || {}).length}
                      onClick={() =>
                        changeEdge("predicate", {
                          op: "exists",
                          field: Object.keys(workflow.fields || {})[0],
                        })
                      }
                    >
                      + Add check
                    </button>
                  )}
                </div>
                {edge!.predicate ? (
                  <>
                    <PredicateEditor
                      fields={workflow.fields || {}}
                      value={edge!.predicate as Predicate}
                      onChange={(v) => changeEdge("predicate", v)}
                    />
                    <button
                      className="inspector-link"
                      onClick={() => changeEdge("predicate", null)}
                    >
                      Remove state checks
                    </button>
                  </>
                ) : (
                  <p className="inspector-help">
                    No state checks on this transition.
                  </p>
                )}
              </section>
              <section className="inspector-divider">
                <label htmlFor="edge-to">Then go to</label>
                <select
                  id="edge-to"
                  value={edge!.to}
                  onChange={(e) => changeEdge("to", e.target.value)}
                >
                  {Object.entries(workflow.nodes).map(([key, n]) => (
                    <option key={key} value={key}>
                      {n.title || key}
                    </option>
                  ))}
                </select>
              </section>
              <details className="inspector-advanced">
                <summary>Advanced settings</summary>
                <label htmlFor="edge-timing">Check timing</label>
                <select
                  id="edge-timing"
                  value={edge!.timing || "next_response"}
                  onChange={(e) => changeEdge("timing", e.target.value)}
                >
                  <option value="next_response">
                    Before the next response
                  </option>
                  <option value="before_action">
                    Before running the action
                  </option>
                </select>
                <label htmlFor="edge-result">Action result (optional)</label>
                <input
                  id="edge-result"
                  value={edge!.result || ""}
                  onChange={(e) => changeEdge("result", e.target.value || null)}
                />
                <p className="inspector-help">Transition ID: {edge!.id}</p>
              </details>
            </>
          ) : (
            <>
              <section>
                <h3>What should happen here?</h3>
                <div className="step-type-picker">
                  {(
                    [
                      [
                        "conversation",
                        "Conversation",
                        "Ask questions or collect information.",
                        MessageSquare,
                      ],
                      [
                        "say",
                        "Say something",
                        "Deliver a fixed message, then continue.",
                        Volume2,
                      ],
                      [
                        "action",
                        "Run an action",
                        "Call a tool or save information.",
                        Wrench,
                      ],
                    ] as const
                  ).map(([key, title, description, Icon]) => (
                    <label
                      className={`step-type ${kind === key ? "chosen" : ""}`}
                      key={key}
                    >
                      <Icon size={22} />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <input
                        type="radio"
                        name="step-type"
                        value={key}
                        checked={kind === key}
                        onChange={() => setKind(key)}
                      />
                    </label>
                  ))}
                </div>
                {kind === "action" && (
                  <label>
                    Registered action
                    <select
                      value={tool || tools[0] || ""}
                      onChange={(e) => setTool(e.target.value)}
                    >
                      {tools.map((t) => (
                        <option key={t} value={t}>
                          {pretty(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="inspector-help insert-explanation">
                  We’ll connect this step for you.
                  <br />
                  {node.title || id} → New step →{" "}
                  {workflow.nodes[edge!.to]?.title || edge!.to}
                  <br />
                  You can edit it right after adding it.
                </p>
                <p className="inspector-help">
                  To finish a branch, change its destination to an existing end
                  step.
                </p>
              </section>
            </>
          )}
        </fieldset>
      </div>
      <footer className="studio-inspector-footer">
        {selection.kind === "insert" ? (
          <>
            <button onClick={onClose}>Cancel</button>
            <button
              className="button black"
              disabled={readOnly || (kind === "action" && !tools.length)}
              onClick={() => {
                try {
                  const result = insertStep(
                    source,
                    selection,
                    kind,
                    tool || tools[0],
                  );
                  onChange(result.source);
                  onSelect({ kind: "step", id: result.id });
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Add {kind === "say" ? "message" : kind} step{" "}
              <ArrowRight size={14} />
            </button>
          </>
        ) : (
          <>
            <span>
              <Check size={13} /> In this tab
            </span>
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
              View YAML
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}
