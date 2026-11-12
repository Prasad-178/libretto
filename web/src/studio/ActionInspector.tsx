import { Select } from "../ui/Select";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Workflow } from "../workflow";
import type { DocumentTransaction } from "./types";
import type { ToolManifest } from "./tool-manifest";
import { configureAction, editActionBindings } from "./authoring-commands";
import { humanizeId } from "./workflow-model";

export function ActionInspector({
  source,
  workflow,
  nodeId,
  tools,
  onTransaction,
  onSettings,
  replaceConnections = false,
  onPendingChange,
}: {
  source: string;
  workflow: Workflow;
  nodeId: string;
  tools: ToolManifest[];
  onTransaction: (tx: DocumentTransaction) => void;
  onSettings?: () => void;
  replaceConnections?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const node = workflow.nodes[nodeId];
  const [toolName, setToolName] = useState(node.tool || ""),
    [args, setArgs] = useState(node.arguments || {}),
    [requires, setRequires] = useState(node.requires || []),
    [results, setResults] = useState<Record<string, string>>({}),
    [routes, setRoutes] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [newParameter, setNewParameter] = useState(""),
    [newField, setNewField] = useState("");
  useEffect(() => {
    setToolName(node.tool || "");
    setArgs(node.arguments || {});
    setRequires(node.requires || []);
    setResults(
      Object.fromEntries(
        (node.edges || [])
          .filter((e) => e.result)
          .map((e) => [e.result!, e.to]),
      ),
    );
    setRoutes(Object.fromEntries((node.edges || []).map((e) => [e.id, e.to])));
    setError("");
  }, [node]);
  const baseline = JSON.stringify([
    node.tool || "",
    node.arguments || {},
    node.requires || [],
    Object.fromEntries(
      (node.edges || [])
        .filter((edge) => edge.result)
        .map((edge) => [edge.result!, edge.to]),
    ),
    Object.fromEntries((node.edges || []).map((edge) => [edge.id, edge.to])),
  ]);
  const pending =
    JSON.stringify([toolName, args, requires, results, routes]) !== baseline;
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  const tool = tools.find((t) => t.name === toolName);
  const parameters =
    tool?.parameters ||
    Object.keys(args).map((name) => ({
      name,
      type: undefined,
      required: undefined,
    }));
  const fieldChoices = (type?: string) =>
    Object.entries(workflow.fields || {}).filter(
      ([, f]) => !type || (f.type || "string") === type,
    );
  const bind = (name: string, field: string) => {
    if (field) {
      setArgs({ ...args, [name]: field });
      setRequires((previous) => [...new Set([...previous, field])]);
    } else
      setArgs(
        Object.fromEntries(Object.entries(args).filter(([id]) => id !== name)),
      );
  };
  const rule =
    node.confirmation &&
    Object.hasOwn(workflow.confirmations || {}, node.confirmation)
      ? workflow.confirmations![node.confirmation]
      : undefined;
  return (
    <div className="action-editor">
      <section>
        <label>
          Registered action
          <Select
            value={toolName}
            onChange={(event) => {
              setToolName(event.target.value);
              setArgs({});
              setResults({});
              setError("");
            }}
          >
            <option value={node.tool || ""}>
              {node.tool || "Choose an action…"}
            </option>
            {tools
              .filter(
                (t) => t.name !== node.tool && workflow.tools?.includes(t.name),
              )
              .map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
          </Select>
        </label>
        <p className="inspector-help">
          Actions are registered by your Python application. Studio edits the
          workflow’s bindings.
        </p>
      </section>
      {!tool && (
        <p className="inspector-notice">
          This runtime has no Python contract for{" "}
          <code>{toolName || "this action"}</code>. Existing YAML bindings
          remain editable; connect a runtime that registers it before testing.
        </p>
      )}
      <section>
        <h3>Inputs</h3>
        <p className="inspector-help">
          Pass collected information into the action.
        </p>
        {parameters.length ? (
          parameters.map((parameter) => (
            <div className="action-input-row" key={parameter.name}>
              <label htmlFor={`action-param-${parameter.name}`}>
                <code>{parameter.name}</code>
                <small>
                  {parameter.type || "Type not available"}
                  {parameter.required ? " · required" : ""}
                </small>
              </label>
              <Select
                id={`action-param-${parameter.name}`}
                aria-label={`Input for ${parameter.name}`}
                value={
                  Object.hasOwn(args, parameter.name)
                    ? args[parameter.name]
                    : ""
                }
                onChange={(e) => bind(parameter.name, e.target.value)}
              >
                <option value="">
                  {parameter.required ? "Choose a field…" : "Not mapped"}
                </option>
                {fieldChoices(parameter.type).map(([id]) => (
                  <option key={id} value={id}>
                    {humanizeId(id)}
                  </option>
                ))}
              </Select>
              {!tool && (
                <button
                  type="button"
                  aria-label={`Remove mapping ${parameter.name}`}
                  onClick={() => bind(parameter.name, "")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="inspector-help">This action has no mapped inputs.</p>
        )}
        {!tool && (
          <details className="action-technical">
            <summary>Add a YAML input mapping</summary>
            <label>
              Parameter ID
              <input
                value={newParameter}
                onChange={(e) => setNewParameter(e.target.value)}
              />
            </label>
            <label>
              Collected field
              <Select
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
              >
                <option value="">Choose a field…</option>
                {fieldChoices().map(([id]) => (
                  <option key={id} value={id}>
                    {humanizeId(id)}
                  </option>
                ))}
              </Select>
            </label>
            <button
              type="button"
              className="button"
              onClick={() => {
                if (!newParameter.trim() || !newField) {
                  setError(
                    "Enter a parameter ID and choose its collected field.",
                  );
                  return;
                }
                if (Object.hasOwn(args, newParameter)) {
                  setError("That parameter already has a mapping.");
                  return;
                }
                bind(newParameter, newField);
                setNewParameter("");
                setNewField("");
                setError("");
              }}
            >
              Add mapping
            </button>
          </details>
        )}
      </section>
      <details className="action-required">
        <summary>Required information · {requires.length}</summary>
        <p className="inspector-help">
          Mapped inputs are required. Select any extra information the action
          needs before it runs.
        </p>
        {Object.keys(workflow.fields || {}).map((field) => (
          <label className="inspector-check" key={field}>
            <input
              type="checkbox"
              checked={requires.includes(field)}
              disabled={
                Object.values(args).includes(field) && requires.includes(field)
              }
              title={
                Object.values(args).includes(field)
                  ? "Required by an input mapping"
                  : undefined
              }
              onChange={(e) =>
                setRequires(
                  e.target.checked
                    ? [...requires, field]
                    : requires.filter((f) => f !== field),
                )
              }
            />
            <span>{humanizeId(field)}</span>
            {Object.values(args).includes(field) && (
              <small aria-hidden="true">Mapped input</small>
            )}
          </label>
        ))}
      </details>
      <div className="action-guard-note">
        <strong>Before this action can run</strong>
        <p>
          {rule
            ? rule.require_delivery !== false
              ? "Requires the mapped values and caller approval of a fully heard readback for this request."
              : "Requires the mapped values and caller approval under the configured confirmation rule."
            : "Requires its collected values. No caller confirmation rule is configured."}
        </p>
        {onSettings && (
          <button type="button" className="inspector-link" onClick={onSettings}>
            {rule
              ? "Review confirmation rule"
              : "Step settings and confirmation"}
          </button>
        )}
      </div>
      <section>
        <h3>Outcome destinations</h3>
        <p className="inspector-help">
          {tool ? (
            <>
              Result IDs are declared by <code>{tool.name}</code> in Python.
              Choose the next step for each result.
            </>
          ) : (
            "These result bindings come from the opened YAML. The Python result contract is not available here."
          )}
        </p>
        {(tool
          ? tool.results.map((result) => ({
              key: result,
              result,
              value: results[result] || "",
            }))
          : (node.edges || []).map((edge) => ({
              key: edge.id,
              result: edge.result || "Unconfigured result",
              value: routes[edge.id] || edge.to,
            }))
        ).map((item) => (
          <div
            className={`action-outcome-row ${item.result === "unknown" ? "unknown-result" : ""}`}
            key={item.key}
          >
            <label htmlFor={`action-result-${item.key}`}>
              {item.result === "unknown" && (
                <AlertTriangle
                  size={13}
                  aria-label="Uncertain outcome recovery"
                />
              )}
              <code>{item.result}</code>
            </label>
            <Select
              id={`action-result-${item.key}`}
              aria-label={`Destination for ${item.result}`}
              value={item.value}
              onChange={(e) =>
                tool
                  ? setResults({ ...results, [item.key]: e.target.value })
                  : setRoutes({ ...routes, [item.key]: e.target.value })
              }
            >
              <option value="">Choose the next step…</option>
              {Object.entries(workflow.nodes).map(([id, n]) => (
                <option key={id} value={id}>
                  {n.title || id}
                </option>
              ))}
            </Select>
          </div>
        ))}
        {(tool?.results.includes("unknown") ||
          (node.edges || []).some((e) => e.result === "unknown")) && (
          <p className="inspector-help">
            Unknown handles an uncertain outcome. Inspect the actual receipt
            before attempting the action again.
          </p>
        )}
      </section>
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
      <div className="action-apply">
        <span>Mappings and destinations apply together.</span>
        <button
          type="button"
          className="button black"
          aria-label="Apply action configuration"
          onClick={() => {
            try {
              onTransaction(
                tool
                  ? configureAction(
                      source,
                      nodeId,
                      tool,
                      args,
                      requires,
                      results,
                      replaceConnections,
                    )
                  : editActionBindings(source, nodeId, args, requires, routes),
              );
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply changes
        </button>
      </div>
    </div>
  );
}
