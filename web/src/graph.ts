import { layoutWorkflow } from "./studio/graph-layout";
import { emptyMetadata } from "./studio/document-store";
import type { GraphLayout, StudioMetadata } from "./studio/types";
import type { Edge, Node } from "@xyflow/react";
import type { FlowNode, Workflow } from "./workflow";
import { routeLabel } from "./studio/workflow-model";

export type Point = { x: number; y: number };
export type StageData = {
  stage: FlowNode;
  synthetic?: boolean;
  active?: boolean;
  pending?: boolean;
  inspected?: boolean;
  stageId?: string;
  inspect?: () => void;
  focus?: () => void;
  exits?: number;
  incoming?: number;
  chips?: { label: string; target: string; inspect: () => void }[];
};
export type BranchData = {
  label: string;
  points: Point[];
  x: number;
  y: number;
  sourceStage: string;
  inspect?: () => void;
  highlighted?: boolean;
  selected?: boolean;
  insert?: () => void;
  members?: { label: string; inspect: () => void }[];
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
      .map((c) => {
        const label = predicateLabel(c, depth + 1);
        const child =
          c && typeof c === "object" ? (c as { op?: string }) : null;
        return child &&
          (child.op === "all" || child.op === "any") &&
          child.op !== p.op
          ? `(${label})`
          : label;
      })
      .join(p.op === "all" ? " AND " : " OR ");
  return "State condition";
}

export const branchLabel = routeLabel;

export function buildGraph(
  workflow: Workflow,
  metadata: StudioMetadata = emptyMetadata(),
  previous?: GraphLayout,
): {
  nodes: StageNode[];
  edges: BranchEdge[];
  layout: GraphLayout;
} {
  const layout = layoutWorkflow(workflow, metadata, previous);
  let startId = "__libretto_start__" + workflow.id;
  while (Object.hasOwn(workflow.nodes, startId)) startId += "_";
  const start = layout.nodes.find((n) => n.id === workflow.start)!;
  const synthetic: StageNode = {
    id: startId,
    type: "stage",
    position: {
      x: layout.entry?.x ?? start.x + start.width / 2 - 66,
      y: layout.entry?.y ?? start.y - 100,
    },
    width: 132,
    height: 48,
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
  };
  const nodes: StageNode[] = [
    synthetic,
    ...layout.nodes.map((n) => ({
      id: n.id,
      type: "stage" as const,
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      data: {
        stage: workflow.nodes[n.id],
        exits: workflow.nodes[n.id].edges?.length || 0,
        incoming: layout.routes.filter(
          (r) =>
            workflow.nodes[r.ref.source].edges.find(
              (e) => e.id === r.ref.edgeId,
            )?.to === n.id,
        ).length,
      },
      ariaLabel: `${workflow.nodes[n.id].title || n.id}, ${workflow.nodes[n.id].kind} step. Open details.`,
    })),
  ];
  const edges: BranchEdge[] = layout.routes.map((r) => {
    const edge = workflow.nodes[r.ref.source].edges.find(
      (e) => e.id === r.ref.edgeId,
    )!;
    const source = nodes.find((n) => n.id === r.ref.source)!,
      target = nodes.find((n) => n.id === edge.to)!;
    const port = (node: StageNode, point: Point) => {
      const dx = (point.x - node.position.x - node.width! / 2) / node.width!,
        dy = (point.y - node.position.y - node.height! / 2) / node.height!;
      return Math.abs(dx) > Math.abs(dy)
        ? dx < 0
          ? "left"
          : "right"
        : dy < 0
          ? "top"
          : "bottom";
    };
    return {
      id: JSON.stringify([r.ref.source, r.ref.edgeId]),
      source: r.ref.source,
      target: edge.to,
      type: "branch",
      sourceHandle: `source-${port(source, r.points[0])}`,
      targetHandle: `target-${port(target, r.points.at(-1)!)}`,
      data: {
        label: branchLabel(edge),
        points: r.points,
        x: r.labelPoint.x,
        y: r.labelPoint.y,
        sourceStage: r.ref.source,
      },
    };
  });
  edges.unshift({
    id: JSON.stringify([startId, "start"]),
    source: startId,
    target: workflow.start,
    type: "branch",
    sourceHandle: "source-bottom",
    targetHandle: "target-top",
    data: {
      label: "",
      sourceStage: startId,
      x: 0,
      y: 0,
      points: layout.entry?.points ?? [
        { x: start.x + start.width / 2, y: start.y - 52 },
        { x: start.x + start.width / 2, y: start.y },
      ],
    },
  });
  return { nodes, edges, layout };
}

export function resizeViewport(
  viewport: { x: number; y: number; zoom: number },
  previousWidth: number,
  nextWidth: number,
) {
  return { ...viewport, x: viewport.x + (nextWidth - previousWidth) / 2 };
}
