import type { Workflow } from "../workflow";
import type { DocumentTransaction, RouteRef } from "./types";
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
}: {
  source: string;
  workflow: Workflow;
  route: RouteRef;
  tools: ToolManifest[];
  onTransaction: (tx: DocumentTransaction) => void;
}) {
  const node = workflow.nodes[route.source],
    edge = node.edges.find((e) => e.id === route.edgeId)!;
  const path = ["nodes", route.source, "edges", edgeIndex(source, route)],
    kind = routeKind(node, edge);
  const set = (key: string, value: unknown, group?: string) =>
    onTransaction({
      label: `Edit ${routeLabel(edge)}`,
      historyGroup: group,
      operations: [{ op: "set", path: [...path, key], value }],
    });
  return (
    <>
      <section>
        <label>
          Route name
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
              <select
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
              </select>
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
            Action result
            <select
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
            </select>
          </label>
        ) : (
          <p className="inspector-help">
            Say follows its first continuation after speaking the exact message.
          </p>
        )}
      </section>
      <section>
        <label>
          Then go to
          <select value={edge.to} onChange={(e) => set("to", e.target.value)}>
            {Object.entries(workflow.nodes).map(([id, n]) => (
              <option value={id} key={id}>
                {n.title || id}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section>
        <label>
          Transition timing
          <select
            value={edge.timing || "next_response"}
            onChange={(e) => set("timing", e.target.value)}
          >
            <option value="next_response">After the current response</option>
            <option value="before_action">Before running the action</option>
          </select>
        </label>
        <p className="inspector-help">
          State checks are deterministic; language matches come from the
          evaluator. YAML order breaks ties within each type.
        </p>
      </section>
    </>
  );
}
