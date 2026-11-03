import type { Workflow } from "../workflow";
import { routeKey, routeKind, routeLabel } from "./workflow-model";
import type {
  RouteDescriptor,
  RoutePresentation,
  RouteRef,
  SavedView,
} from "./types";
export function describeRoutes(workflow: Workflow): RouteDescriptor[] {
  const nodes = Object.entries(workflow.nodes);
  if (!nodes.length || nodes.length > 64)
    throw new Error("A workflow must have 1–64 steps.");
  if (!Object.hasOwn(workflow.nodes, workflow.start))
    throw new Error("Choose an existing start step in YAML.");
  const routes = nodes.flatMap(([source, node]) =>
    (node.edges || []).map((edge) => ({
      ref: { source, edgeId: edge.id },
      target: edge.to,
      label: routeLabel(edge),
      kind: routeKind(node, edge),
      condition: edge.condition || "",
      predicate: edge.predicate,
      result: edge.result,
      timing:
        edge.timing === "before_action"
          ? ("before_action" as const)
          : ("next_response" as const),
    })),
  );
  if (routes.length > 256)
    throw new Error("The visual preview supports up to 256 transitions.");
  const seen = new Set<string>();
  for (const route of routes) {
    if (!Object.hasOwn(workflow.nodes, route.target))
      throw new Error(
        `Unknown destination “${route.target}” from “${route.ref.source}”. Fix the YAML reference.`,
      );
    const key = routeKey(route.ref);
    if (seen.has(key))
      throw new Error(
        `Duplicate transition “${route.ref.edgeId}” in “${route.ref.source}”.`,
      );
    seen.add(key);
  }
  return routes;
}
export function presentRoutes(
  routes: RouteDescriptor[],
  view: SavedView | null,
): RoutePresentation[] {
  const visible = view ? new Set(view.visibleRoutes.map(routeKey)) : null;
  const incoming = new Map<string, Set<string>>();
  for (const r of routes) {
    const set = incoming.get(r.target) || new Set<string>();
    set.add(r.ref.source);
    incoming.set(r.target, set);
  }
  const result: RoutePresentation[] = [],
    used = new Set<string>();
  for (const route of routes) {
    const key = routeKey(route.ref);
    if (used.has(key)) continue;
    if (visible && !visible.has(key)) {
      result.push({ refs: [route.ref], mode: "hidden", target: route.target });
      used.add(key);
      continue;
    }
    const parallel =
      route.kind === "result"
        ? routes.filter(
            (r) =>
              r.kind === "result" &&
              r.ref.source === route.ref.source &&
              r.target === route.target &&
              (!visible || visible.has(routeKey(r.ref))),
          )
        : [];
    const refs = parallel.length > 1 ? parallel.map((r) => r.ref) : [route.ref];
    refs.forEach((ref) => used.add(routeKey(ref)));
    result.push({
      refs,
      target: route.target,
      mode:
        parallel.length > 1
          ? "bundle"
          : (incoming.get(route.target)?.size || 0) >= 4
            ? "chip"
            : "drawn",
    });
  }
  return result;
}
export function analyzeStructure(workflow: Workflow) {
  const routes = describeRoutes(workflow),
    ids = Object.keys(workflow.nodes),
    order = new Map(ids.map((id, i) => [id, i]));
  const outgoing = new Map(
    ids.map((id) => [id, routes.filter((r) => r.ref.source === id)]),
  );
  let cursor = 0;
  const indices = new Map<string, number>(),
    low = new Map<string, number>(),
    stack: string[] = [],
    onStack = new Set<string>(),
    components: string[][] = [];
  function visit(id: string) {
    indices.set(id, cursor);
    low.set(id, cursor++);
    stack.push(id);
    onStack.add(id);
    for (const r of outgoing.get(id) || []) {
      if (!indices.has(r.target)) {
        visit(r.target);
        low.set(id, Math.min(low.get(id)!, low.get(r.target)!));
      } else if (onStack.has(r.target))
        low.set(id, Math.min(low.get(id)!, indices.get(r.target)!));
    }
    if (low.get(id) === indices.get(id)) {
      const group: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        group.push(member);
      } while (member !== id);
      components.push(group.sort((a, b) => order.get(a)! - order.get(b)!));
    }
  }
  ids.forEach((id) => {
    if (!indices.has(id)) visit(id);
  });
  components.sort((a, b) => order.get(a[0])! - order.get(b[0])!);
  const membership = new Map(
    components.flatMap((c, i) => c.map((id) => [id, i] as const)),
  );
  const reached = new Set<string>();
  function reach(id: string) {
    if (reached.has(id)) return;
    reached.add(id);
    for (const r of outgoing.get(id) || []) reach(r.target);
  }
  reach(workflow.start);
  const condensed = routes
    .filter((r) => membership.get(r.ref.source) !== membership.get(r.target))
    .map((r) => ({
      source: membership.get(r.ref.source)!,
      target: membership.get(r.target)!,
    }));
  const ranks = components.map(() => 0);
  for (let i = 0; i < components.length; i++)
    for (const e of condensed)
      ranks[e.target] = Math.max(ranks[e.target], ranks[e.source] + 1);
  return {
    components,
    ranks,
    unreachable: ids.filter((id) => !reached.has(id)),
    returns: routes
      .filter(
        (r) =>
          membership.get(r.ref.source) === membership.get(r.target) &&
          order.get(r.target)! <= order.get(r.ref.source)!,
      )
      .map((r) => r.ref),
  };
}
