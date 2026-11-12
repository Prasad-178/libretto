import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { FlowEdge, Workflow } from "../workflow";
import type { Selection } from "../StepInspector";
import { Select } from "../ui/Select";
import { createRoute } from "./editor-commands";
import { PredicateEditor, type Predicate } from "./PredicateEditor";
import { routeLabel } from "./workflow-model";
import type { ToolManifest } from "./tool-manifest";

export function ConnectionRows({
  edges,
  workflow,
  nodeId,
  onSelect,
}: {
  edges: FlowEdge[];
  workflow: Workflow;
  nodeId: string;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <>
      {edges.map((edge) => (
        <div key={edge.id} className="inspector-transition">
          <button
            onClick={() =>
              onSelect({ kind: "edge", source: nodeId, edgeId: edge.id })
            }
          >
            <span>{routeLabel(edge)}</span>
            <strong>
              <ArrowRight size={14} />
              {workflow.nodes[edge.to]?.title || edge.to}
            </strong>
          </button>
          {edge.timing !== "before_action" && (
            <button
              className="inspector-link"
              onClick={() =>
                onSelect({ kind: "insert", source: nodeId, edgeId: edge.id })
              }
            >
              + Insert step
            </button>
          )}
        </div>
      ))}
    </>
  );
}
export function StepConnections({
  source,
  workflow,
  nodeId,
  tools,
  onSelect,
  onChange,
}: {
  source: string;
  workflow: Workflow;
  nodeId: string;
  tools: ToolManifest[];
  onSelect: (selection: Selection) => void;
  onChange: (source: string) => void;
}) {
  const node = workflow.nodes[nodeId],
    edges = node.edges || [],
    incoming = Object.entries(workflow.nodes).flatMap(([id, n]) =>
      (n.edges || [])
        .filter((edge) => edge.to === nodeId)
        .map((edge) => ({ id, edge })),
    );
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [target, setTarget] = useState(""),
    [condition, setCondition] = useState(""),
    [ruleType, setRuleType] = useState("language"),
    [predicate, setPredicate] = useState<Predicate>({
      op: "exists",
      field: Object.keys(workflow.fields || {})[0] || "",
    }),
    [error, setError] = useState("");
  const contract = tools.find((tool) => tool.name === node.tool),
    missingResults = contract?.results.filter(
      (result) => !edges.some((edge) => edge.result === result),
    );
  const canAdd =
    node.kind !== "end" &&
    !(node.kind === "say" && edges.length > 0) &&
    !(node.kind === "action" && missingResults?.length === 0);
  return (
    <>
      <section>
        <h3>Outgoing connections · {edges.length}</h3>
        <ConnectionRows
          edges={edges}
          workflow={workflow}
          nodeId={nodeId}
          onSelect={onSelect}
        />
        {!edges.length && (
          <p className="inspector-help">
            This step has no outgoing connections.
          </p>
        )}
        {canAdd && (
          <button
            className="inspector-link"
            onClick={() => {
              setAdding(!adding);
              setError("");
            }}
          >
            + Add connection
          </button>
        )}
        {node.kind === "action" && !canAdd && (
          <p className="inspector-help">
            Each declared result already has a connection. Edit its destination
            or label instead.
          </p>
        )}
        {adding && (
          <div className="new-connection">
            <label>
              Connection name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="For example, Details collected"
              />
            </label>
            <label>
              Go to
              <Select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose a step…</option>
                {Object.entries(workflow.nodes).map(([id, n]) => (
                  <option key={id} value={id}>
                    {n.title || id}
                  </option>
                ))}
              </Select>
            </label>
            {node.kind === "action" ? (
              <label>
                When the tool returns
                {contract ? (
                  <Select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                  >
                    <option value="">Choose a result…</option>
                    {missingResults?.map((result) => (
                      <option key={result}>{result}</option>
                    ))}
                  </Select>
                ) : (
                  <input
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                  />
                )}
              </label>
            ) : (
              <>
                <label>
                  Continue when
                  <Select
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value)}
                  >
                    <option value="language">
                      Caller intent · stage controller
                    </option>
                    <option value="state">
                      Collected information · deterministic check
                    </option>
                  </Select>
                </label>
                {ruleType === "state" ? (
                  <PredicateEditor
                    value={predicate}
                    fields={workflow.fields || {}}
                    onChange={setPredicate}
                  />
                ) : (
                  <label>
                    Language condition
                    <textarea
                      rows={3}
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            <p className="inspector-help">
              The connection edits the YAML. Its stable route ID is available in
              Advanced after creation.
            </p>
            <button
              className="button black"
              onClick={() => {
                try {
                  const base =
                    name
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9_]+/g, "_")
                      .replace(/^_+|_+$/g, "") || "connection";
                  let id = base,
                    n = 2;
                  while (edges.some((edge) => edge.id === id))
                    id = `${base}_${n++}`;
                  onChange(
                    createRoute(source, nodeId, {
                      id,
                      to: target,
                      ...(name.trim() ? { label: name.trim() } : {}),
                      ...(node.kind === "action"
                        ? { result: condition }
                        : ruleType === "state"
                          ? { predicate }
                          : { condition }),
                    }),
                  );
                  setAdding(false);
                  setName("");
                  setCondition("");
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Create connection
            </button>
            <button className="inspector-link" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        )}
        {error && (
          <p className="inspector-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section>
        <h3>Incoming connections · {incoming.length}</h3>
        {incoming.length ? (
          incoming.map(({ id, edge }) => (
            <div
              className="inspector-transition"
              key={JSON.stringify([id, edge.id])}
            >
              <button
                onClick={() =>
                  onSelect({ kind: "edge", source: id, edgeId: edge.id })
                }
              >
                <span>{workflow.nodes[id].title || id}</span>
                <strong>{routeLabel(edge)}</strong>
              </button>
            </div>
          ))
        ) : (
          <p className="inspector-help">
            {workflow.start === nodeId
              ? "This is the first step after the welcome message."
              : "No step connects here yet. Add an incoming connection or choose this as the starting step."}
          </p>
        )}
      </section>
    </>
  );
}
