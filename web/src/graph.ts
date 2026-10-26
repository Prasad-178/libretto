import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { FlowNode, Workflow } from "./workflow";

export type Point = { x: number; y: number };
export type StageData = {
  stage: FlowNode;
  synthetic?: boolean;
  active?: boolean;
  pending?: boolean;
  inspected?: boolean;
  stageId?: string;
  inspect?: () => void;
};
export type BranchData = {
  label: string;
  points: Point[];
  x: number;
  y: number;
  sourceStage: string;
  inspect?: () => void;
  highlighted?: boolean;
};
export type StageNode = Node<StageData, "stage">;
export type BranchEdge = Edge<BranchData, "branch">;

export function predicateLabel(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || depth > 8)
    return "State condition";
  const p = value as {
    op?: string;
    field?: string;
    value?: unknown;
    conditions?: unknown[];
  };
  if (p.op === "exists") return `${p.field} is set`;
  if (p.op === "equals") return `${p.field} = ${JSON.stringify(p.value)}`;
  if (p.op === "not")
    return `NOT (${predicateLabel(p.conditions?.[0], depth + 1)})`;
  if ((p.op === "all" || p.op === "any") && Array.isArray(p.conditions))
    return p.conditions
      .map((c) => predicateLabel(c, depth + 1))
      .join(p.op === "all" ? " AND " : " OR ");
  return "State condition";
}

export function branchLabel(edge: FlowNode["edges"][number]): string {
  return (
    edge.condition ||
    (edge.result
      ? `Result: ${edge.result}`
      : edge.predicate
        ? predicateLabel(edge.predicate)
        : "Continue")
  );
}

export function buildGraph(workflow: Workflow): {
  nodes: StageNode[];
  edges: BranchEdge[];
} {
  const entries = Object.entries(workflow.nodes);
  if (!entries.length || entries.length > 64)
    throw new Error("A workflow must have 1–64 stages.");
  if (!Object.hasOwn(workflow.nodes, workflow.start))
    throw new Error("Choose an existing start stage in YAML.");
  const total = entries.reduce(
    (count, [, n]) => count + (n.edges?.length || 0),
    0,
  );
  if (total > 256)
    throw new Error("The visual preview supports up to 256 transitions.");
  const startId = "__libretto_start__" + workflow.id; // Never collide with an actual stage.
  let syntheticId = startId;
  while (Object.hasOwn(workflow.nodes, syntheticId)) syntheticId += "_";
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "TB",
    nodesep: 90,
    ranksep: 100,
    edgesep: 28,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));
  const nodes: StageNode[] = [
    {
      id: syntheticId,
      type: "stage",
      position: { x: 0, y: 0 },
      width: 132,
      height: 56,
      data: {
        synthetic: true,
        stage: {
          kind: "start",
          title: "Start",
          prompt: "",
          tools: [],
          patient: false,
          edges: [],
        },
      },
    },
    ...entries.map(([id, stage]): StageNode => ({
      id,
      type: "stage",
      position: { x: 0, y: 0 },
      width: stage.kind === "end" ? 132 : 290,
      height: stage.kind === "end" ? 56 : 142,
      data: { stage },
      ariaLabel: `${stage.title || id}, ${stage.kind} stage. Open details.`,
    })),
  ];
  for (const n of nodes)
    g.setNode(n.id, { width: n.width!, height: n.height! });
  const edges: BranchEdge[] = [];
  function connect(source: string, target: string, id: string, label: string) {
    if (!Object.hasOwn(workflow.nodes, target))
      throw new Error(
        `Unknown destination “${target}” from “${source}”. Fix the YAML reference.`,
      );
    g.setEdge(
      source,
      target,
      { width: label ? 204 : 0, height: label ? 26 : 0, labelpos: "c" },
      id,
    );
    edges.push({
      id,
      type: "branch",
      source,
      target,
      data: { label, points: [], x: 0, y: 0, sourceStage: source },
    });
  }
  connect(
    syntheticId,
    workflow.start,
    JSON.stringify([syntheticId, "start"]),
    "",
  );
  for (const [id, node] of entries) {
    const seen = new Set<string>();
    for (const edge of node.edges || []) {
      if (seen.has(edge.id))
        throw new Error(`Duplicate transition “${edge.id}” in “${id}”.`);
      seen.add(edge.id);
      connect(id, edge.to, JSON.stringify([id, edge.id]), branchLabel(edge));
    }
  }
  dagre.layout(g);
  for (const n of nodes) {
    const position = g.node(n.id);
    n.position = {
      x: position.x - n.width! / 2,
      y: position.y - n.height! / 2,
    };
  }
  function port(id: string, p: Point) {
    const n = g.node(id);
    const dx = (p.x - n.x) / n.width;
    const dy = (p.y - n.y) / n.height;
    return Math.abs(dx) > Math.abs(dy)
      ? dx < 0
        ? "left"
        : "right"
      : dy < 0
        ? "top"
        : "bottom";
  }
  for (const edge of edges) {
    const layout = g.edge({ v: edge.source, w: edge.target, name: edge.id });
    edge.data = {
      ...edge.data!,
      points: layout.points,
      x: layout.x ?? 0,
      y: layout.y ?? 0,
    };
    edge.sourceHandle = `source-${port(edge.source, layout.points[0])}`;
    edge.targetHandle = `target-${port(edge.target, layout.points.at(-1)!)}`;
  }
  return { nodes, edges };
}
