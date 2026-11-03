import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import type { Workflow } from "../workflow";
import { predicateLabel } from "../graph";
import { describeRoutes, presentRoutes } from "./graph-model";
import { routeKey } from "./workflow-model";
import type { RouteRef, SavedView } from "./types";
export const routeTypeLabel = {
  language: "Language",
  state: "State check",
  result: "Action result",
  automatic: "Automatic",
  "legacy-mixed": "Mixed (legacy)",
  unconfigured: "Needs a rule",
};
export function RoutesTable({
  workflow,
  view,
  onSelect,
  onReveal,
}: {
  workflow: Workflow;
  view: SavedView | null;
  onSelect: (ref: RouteRef) => void;
  onReveal: (ref: RouteRef) => void;
}) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [canvas, setCanvas] = useState("all");
  const routes = useMemo(() => describeRoutes(workflow), [workflow]);
  const presentation = presentRoutes(routes, view),
    modes = new Map(
      presentation.flatMap((p) => p.refs.map((ref) => [routeKey(ref), p.mode])),
    );
  const filtered = routes.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (canvas === "all" ||
        (canvas === "hidden"
          ? modes.get(routeKey(r.ref)) === "hidden"
          : modes.get(routeKey(r.ref)) !== "hidden")) &&
      [
        r.label,
        r.ref.source,
        workflow.nodes[r.ref.source].title,
        r.target,
        workflow.nodes[r.target].title,
        r.condition,
        JSON.stringify(r.predicate),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="routes-page" aria-label="Complete route index">
      <div className="routes-toolbar">
        <strong>{routes.length} routes</strong>
        <label className="route-search">
          <Search size={16} />
          <input
            aria-label="Search routes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search routes, steps or conditions"
          />
        </label>
        <select
          aria-label="Route type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">All types</option>
          {Object.entries(routeTypeLabel).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Canvas visibility"
          value={canvas}
          onChange={(e) => setCanvas(e.target.value)}
        >
          <option value="all">Canvas: All</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </select>
        <span>YAML order</span>
      </div>
      <div className="routes-scroll">
        <table>
          <thead>
            <tr>
              {[
                "From step",
                "Route name",
                "Type",
                "Condition / check",
                "To step",
                "Timing",
                "Canvas",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((route) => (
              <tr key={routeKey(route.ref)}>
                <td>
                  {workflow.nodes[route.ref.source].title || route.ref.source}
                </td>
                <td>
                  <button onClick={() => onSelect(route.ref)}>
                    {route.label}
                  </button>
                </td>
                <td>{routeTypeLabel[route.kind]}</td>
                <td>
                  {route.predicate
                    ? predicateLabel(route.predicate)
                    : route.result
                      ? `Result: ${route.result}`
                      : route.condition ||
                        (route.kind === "automatic"
                          ? "After speaking"
                          : "No execution rule")}
                  {route.kind === "legacy-mixed" && (
                    <small>Predicate first; language can also match.</small>
                  )}
                </td>
                <td>{workflow.nodes[route.target].title || route.target}</td>
                <td>
                  {route.timing === "before_action"
                    ? "Before action"
                    : "Next response"}
                </td>
                <td>
                  <button
                    className="route-reveal"
                    onClick={() => onReveal(route.ref)}
                    title={`Reveal ${route.label} in Flow`}
                  >
                    {modes.get(routeKey(route.ref))}
                    <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="empty-state">No routes match these filters.</p>
        )}
      </div>
    </section>
  );
}
