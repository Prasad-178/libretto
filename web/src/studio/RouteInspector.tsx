import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { moveRoute, renameRoute, removeRoute } from "./authoring-commands";
import { Select } from "../ui/Select";
import type { Workflow } from "../workflow";
import type { DocumentTransaction, RouteRef, StudioMetadata } from "./types";
import type { ToolManifest } from "./tool-manifest";
import { edgeIndex } from "../studio-editing";
import { routeKind, routeLabel } from "./workflow-model";
import { PredicateEditor, type Predicate } from "./PredicateEditor";
export function RouteInspector({
  source,
  workflow,
  route,
  tools,
  onTransaction,
  metadata,
  onRenamed,
  onRemoved,
}: {
  source: string;
  workflow: Workflow;
  route: RouteRef;
  tools: ToolManifest[];
  onTransaction: (tx: DocumentTransaction) => void | boolean;
  metadata: StudioMetadata;
  onRenamed: (id: string) => void;
  onRemoved: () => void;
}) {
  const node = workflow.nodes[route.source],
    edge = node.edges.find((e) => e.id === route.edgeId)!;
  const [nextId, setNextId] = useState(edge.id),
    [error, setError] = useState("");
  useEffect(() => {
    setNextId(edge.id);
    setError("");
  }, [edge.id, route.source]);
  const index = edgeIndex(source, route);
  const path = ["nodes", route.source, "edges", index],
    kind = routeKind(node, edge);
  const set = (key: string, value: unknown, group?: string) =>
    onTransaction({
      label: `Edit ${routeLabel(edge)}`,
      historyGroup: group,
      operations: [{ op: "set", path: [...path, key], value }],
    });
  let removalReason = "";
  try {
    removeRoute(source, route, metadata, tools);
  } catch (e) {
    removalReason = (e as Error).message;
  }
  return (
    <>
      <section>
        <label>
          Canvas label
          <input
            maxLength={200}
            value={edge.label ?? ""}
            placeholder={routeLabel({ ...edge, label: undefined })}
            onChange={(e) =>
              set(
                "label",
                e.target.value,
                `route:${JSON.stringify(route)}:label`,
              )
            }
          />
        </label>
        <p className="inspector-help">
          ID: <code>{edge.id}</code>. Display name does not change how this
          route executes.
        </p>
      </section>
      <section>
        <h3>Continue when</h3>
        {kind === "legacy-mixed" && (
          <p className="inspector-notice">
            Legacy mixed route: matching state checks take precedence over
            language routes. If no state route matches, its language condition
            can also select this route. These rules are not an AND condition.
          </p>
        )}
        {node.kind === "conversation" ? (
          <>
            <label>
              Rule type
              <Select
                value={
                  kind === "legacy-mixed"
                    ? "legacy-mixed"
                    : edge.predicate
                      ? "state"
                      : "language"
                }
                onChange={(e) => {
                  const field = Object.keys(workflow.fields || {})[0];
                  onTransaction({
                    label: "Change rule type",
                    operations:
                      e.target.value === "state"
                        ? [
                            { op: "delete", path: [...path, "condition"] },
                            {
                              op: "set",
                              path: [...path, "predicate"],
                              value: { op: "exists", field },
                            },
                          ]
                        : [
                            { op: "delete", path: [...path, "predicate"] },
                            {
                              op: "set",
                              path: [...path, "condition"],
                              value: "",
                            },
                          ],
                  });
                }}
              >
                <option value="language">Language condition</option>
                <option
                  value="state"
                  disabled={!Object.keys(workflow.fields || {}).length}
                >
                  State check
                </option>
                {kind === "legacy-mixed" && (
                  <option value="legacy-mixed" disabled>
                    Legacy mixed rule
                  </option>
                )}
              </Select>
            </label>
            {(kind === "language" ||
              kind === "unconfigured" ||
              kind === "legacy-mixed") && (
              <label>
                Language condition
                <textarea
                  rows={5}
                  value={edge.condition || ""}
                  onChange={(e) =>
                    set(
                      "condition",
                      e.target.value,
                      `route:${JSON.stringify(route)}:condition`,
                    )
                  }
                  placeholder="The caller has…"
                />
              </label>
            )}
            {!!edge.predicate && (
              <PredicateEditor
                fields={workflow.fields || {}}
                value={edge.predicate as Predicate}
                onChange={(predicate) => set("predicate", predicate)}
              />
            )}
            {kind === "unconfigured" && (
              <p className="inspector-notice">
                Add an execution rule. A bare conversation route does not
                continue automatically.
              </p>
            )}
          </>
        ) : node.kind === "action" ? (
          <label>
            When the tool returns
            <Select
              value={edge.result || ""}
              onChange={(e) => set("result", e.target.value)}
            >
              <option value="">Choose result…</option>
              {[
                ...new Set([
                  ...(tools.find((t) => t.name === node.tool)?.results || []),
                  ...(edge.result ? [edge.result] : []),
                ]),
              ].map((result) => (
                <option key={result}>{result}</option>
              ))}
            </Select>
          </label>
        ) : (
          <p className="inspector-help">
            {node.kind === "end"
              ? "Inactive connection: End finishes the conversation and does not follow its retained connections."
              : index > 0
                ? "Inactive continuation: Say follows only its first connection. Move this connection first to use it."
                : "Say follows its first continuation after speaking the exact message."}
          </p>
        )}
      </section>
      <section>
        <label>
          Go to
          <Select value={edge.to} onChange={(e) => set("to", e.target.value)}>
            {Object.entries(workflow.nodes).map(([id, n]) => (
              <option value={id} key={id}>
                {n.title || id}
              </option>
            ))}
          </Select>
        </label>
      </section>
      {node.kind === "action" && (
        <p className="inspector-help">
          Result IDs come from the action’s registered Python contract. The
          canvas label changes display text independently.
        </p>
      )}
      <details className="connection-advanced">
        <summary>Advanced connection settings</summary>
        <label>
          Route ID
          <input value={nextId} onChange={(e) => setNextId(e.target.value)} />
        </label>
        <button
          type="button"
          className="button"
          onClick={() => {
            try {
              const tx = renameRoute(source, route, nextId, metadata);
              if (onTransaction(tx) !== false) onRenamed(nextId);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply route ID
        </button>
        <label>
          Transition timing
          <Select
            value={edge.timing || "next_response"}
            onChange={(e) => set("timing", e.target.value)}
          >
            <option value="next_response">After the current response</option>
            <option value="before_action">Before running the action</option>
          </Select>
        </label>
        <div className="connection-order">
          <strong>
            YAML order · {index + 1} of {node.edges.length}
          </strong>
          <div>
            <button
              type="button"
              className="button"
              aria-label="Move connection earlier"
              disabled={index === 0}
              onClick={() => {
                try {
                  onTransaction(moveRoute(source, route, -1));
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <ArrowUp size={14} />
              Earlier
            </button>
            <button
              type="button"
              className="button"
              aria-label="Move connection later"
              disabled={index === node.edges.length - 1}
              onClick={() => {
                try {
                  onTransaction(moveRoute(source, route, 1));
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <ArrowDown size={14} />
              Later
            </button>
          </div>
        </div>
        <p className="inspector-help">
          State checks are deterministic; language matches come from the stage
          controller. YAML order breaks ties within each type.
        </p>
        {node.kind === "action" && !tools.some((t) => t.name === node.tool) && (
          <label>
            Result ID · contract unavailable
            <input
              value={edge.result || ""}
              onChange={(e) => set("result", e.target.value)}
            />
            <span className="inspector-help">
              Edits this YAML result binding. The Python result contract must
              match before testing.
            </span>
          </label>
        )}
      </details>
      <footer className="connection-footer">
        <button
          type="button"
          className="button danger"
          disabled={!!removalReason}
          onClick={() => {
            try {
              if (
                onTransaction(removeRoute(source, route, metadata, tools)) !==
                false
              )
                onRemoved();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Delete connection
        </button>
        <p className="inspector-help">
          {removalReason || "Saved in this browser · Undo available"}
        </p>
      </footer>
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
