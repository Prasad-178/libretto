import dagre from "@dagrejs/dagre";
import type { Workflow } from "../workflow";
import type { GraphLayout, Point, StudioMetadata } from "./types";
import { analyzeStructure, describeRoutes, presentRoutes } from "./graph-model";
import { routeKey } from "./workflow-model";
export const STEP_WIDTH = 264,
  STEP_HEIGHT = 90;
export function layoutWorkflow(
  workflow: Workflow,
  metadata: StudioMetadata,
  previous?: GraphLayout,
): GraphLayout {
  const routes = describeRoutes(workflow),
    structure = analyzeStructure(workflow);
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "TB",
    nodesep: 64,
    ranksep: 90,
    edgesep: 30,
    marginx: 80,
    marginy: 140,
  });
  g.setDefaultEdgeLabel(() => ({}));
  // Condensed DAG order keeps independent components deterministic; Dagre routes cycle returns.
  const components = structure.components
    .map((ids, i) => ({ ids, rank: structure.ranks[i], i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  for (const { ids } of components)
    for (const id of ids) {
      const terminal = workflow.nodes[id].kind === "end";
      g.setNode(id, {
        width: terminal
          ? Math.min(
              STEP_WIDTH,
              Math.max(132, (workflow.nodes[id].title || id).length * 7 + 50),
            )
          : STEP_WIDTH,
        height: terminal ? 48 : STEP_HEIGHT,
      });
    }
  const drawn = new Set(
    presentRoutes(routes, null)
      .filter((p) => p.mode === "drawn" || p.mode === "bundle")
      .map((p) => routeKey(p.refs[0])),
  );
  for (const r of routes.filter((r) => drawn.has(routeKey(r.ref))))
    g.setEdge(
      r.ref.source,
      r.target,
      {
        width: 210,
        height: 28,
        labelpos: "c",
      },
      routeKey(r.ref),
    );
  let entryId = "__studio_entry__";
  while (Object.hasOwn(workflow.nodes, entryId)) entryId += "_";
  g.setNode(entryId, { width: 132, height: 48 });
  g.setEdge(entryId, workflow.start, { width: 0, height: 0 }, "entry");
  dagre.layout(g);
  const nodes = Object.keys(workflow.nodes).map((id) => {
    const n = g.node(id),
      pinned = metadata.positions[id],
      old = previous?.nodes.find((n) => n.id === id);
    return {
      id,
      x: pinned?.x ?? old?.x ?? n.x - n.width / 2,
      y: pinned?.y ?? old?.y ?? n.y - n.height / 2,
      width: n.width,
      height: n.height,
    };
  });
  // Isolate diagnostic-only orphan components from the reachable workflow.
  if (structure.unreachable.length) {
    const orphan = new Set(structure.unreachable),
      reachable = nodes.filter((n) => !orphan.has(n.id));
    const right = Math.max(...reachable.map((n) => n.x + n.width)) + 180,
      min = Math.min(...nodes.filter((n) => orphan.has(n.id)).map((n) => n.x));
    for (const n of nodes)
      if (
        orphan.has(n.id) &&
        !metadata.positions[n.id] &&
        !previous?.nodes.some((p) => p.id === n.id)
      )
        n.x += right - min;
  }
  if (previous)
    for (const n of nodes)
      if (
        !metadata.positions[n.id] &&
        !previous.nodes.some((p) => p.id === n.id)
      ) {
        while (
          nodes.some(
            (o) =>
              o !== n &&
              n.x < o.x + o.width + 32 &&
              n.x + n.width + 32 > o.x &&
              n.y < o.y + o.height + 32 &&
              n.y + n.height + 32 > o.y,
          )
        )
          n.x += STEP_WIDTH + 64;
      }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boundary = (id: string, toward: Point): Point => {
    const n = byId.get(id)!,
      cx = n.x + n.width / 2,
      cy = n.y + n.height / 2,
      dx = toward.x - cx,
      dy = toward.y - cy;
    const scale =
      1 /
      Math.max(Math.abs(dx) / (n.width / 2), Math.abs(dy) / (n.height / 2), 1);
    return { x: cx + dx * scale, y: cy + dy * scale };
  };
  const laidRoutes = routes.map((r) => {
    if (r.ref.source === r.target) {
      const n = byId.get(r.target)!,
        index = routes
          .filter(
            (route) =>
              route.ref.source === r.target && route.target === r.target,
          )
          .findIndex((route) => routeKey(route.ref) === routeKey(r.ref));
      const right = n.x + n.width,
        center = n.y + n.height / 2,
        lane = right + 100 + index * 48,
        top = n.y - 48 - index * 36;
      return {
        ref: r.ref,
        points: [
          { x: right, y: center },
          { x: lane, y: center },
          { x: lane, y: top },
          { x: n.x + n.width / 2, y: top },
          { x: n.x + n.width / 2, y: n.y },
        ],
        labelPoint: { x: lane + 20, y: center - 24 },
      };
    }
    const edge = g.edge({
      v: r.ref.source,
      w: r.target,
      name: routeKey(r.ref),
    });
    if (!edge) {
      const source = byId.get(r.ref.source)!,
        target = byId.get(r.target)!;
      const from = {
          x: source.x + source.width / 2,
          y: source.y + source.height,
        },
        to = { x: target.x + target.width / 2, y: target.y };
      return {
        ref: r.ref,
        points: [
          from,
          { x: from.x, y: (from.y + to.y) / 2 },
          { x: to.x, y: (from.y + to.y) / 2 },
          to,
        ],
        labelPoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      };
    }
    const points: Point[] = edge.points.map((p: Point) => ({ ...p }));
    points[0] = boundary(r.ref.source, points[1]);
    points[points.length - 1] = boundary(r.target, points.at(-2)!);
    return {
      ref: r.ref,
      points,
      labelPoint: { x: edge.x ?? points[1].x, y: edge.y ?? points[1].y },
    };
  });
  const x = Math.min(...nodes.map((n) => n.x)),
    y = Math.min(...nodes.map((n) => n.y));
  const entryNode = g.node(entryId),
    entryEdge = g.edge({ v: entryId, w: workflow.start, name: "entry" });
  return {
    entry: {
      x: entryNode.x - 66,
      y: entryNode.y - 24,
      points: entryEdge.points,
    },
    nodes,
    routes: laidRoutes,
    unreachable: structure.unreachable,
    bounds: {
      x,
      y,
      width: Math.max(...nodes.map((n) => n.x + n.width)) - x,
      height: Math.max(...nodes.map((n) => n.y + n.height)) - y,
    },
  };
}
