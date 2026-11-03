import type { FlowEdge, FlowNode } from "../workflow";
import type { RouteKind, RouteRef } from "./types";

export function routeKey(ref: RouteRef): string {
  return JSON.stringify([ref.source, ref.edgeId]);
}
export function humanizeId(id: string): string {
  const words = id.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Untitled";
}
export function routeLabel(edge: FlowEdge): string {
  return edge.label?.trim() || humanizeId(edge.id);
}
export function routeKind(node: Pick<FlowNode, "kind">, edge: FlowEdge): RouteKind {
  if (node.kind === "action") return edge.result ? "result" : "unconfigured";
  if (node.kind === "say") return "automatic";
  if (edge.predicate && edge.condition) return "legacy-mixed";
  if (edge.predicate) return "state";
  if (edge.condition) return "language";
  return "unconfigured";
}
