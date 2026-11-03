import type { Workflow } from "../workflow";
import { emptyMetadata } from "./document-store";
import { routeKey } from "./workflow-model";
import type { RouteRef, StudioMetadata } from "./types";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 1000;
const list = (v: unknown): unknown[] =>
  Array.isArray(v) ? v.slice(0, 512) : [];
export function readStudioMetadata(
  source: string,
  workflow: Workflow,
): { metadata: StudioMetadata; notices: string[] } {
  if (source.length > 1_000_000) throw new Error("Layout file is too large.");
  const value: unknown = JSON.parse(source);
  if (!object(value) || value.version !== 1)
    throw new Error("Unsupported Studio layout version.");
  const metadata = emptyMetadata(),
    notices: string[] = [];
  const nodes = new Set(Object.keys(workflow.nodes));
  const routes = new Set(
    Object.entries(workflow.nodes).flatMap(([source, node]) =>
      (node.edges || []).map((e) => routeKey({ source, edgeId: e.id })),
    ),
  );
  const stale = (kind: string, id: string) =>
    notices.push(`Ignored ${kind} ${id}: it no longer matches this workflow.`);
  if (
    typeof value.sourceFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(value.sourceFingerprint)
  )
    metadata.sourceFingerprint = value.sourceFingerprint;
  if (object(value.positions))
    for (const [id, p] of Object.entries(value.positions)) {
      if (
        nodes.has(id) &&
        object(p) &&
        typeof p.x === "number" &&
        typeof p.y === "number" &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Math.abs(p.x) <= 1e6 &&
        Math.abs(p.y) <= 1e6
      )
        metadata.positions[id] = { x: p.x, y: p.y };
      else stale("position", id);
    }
  if (object(value.sourceNames))
    for (const [id, label] of Object.entries(value.sourceNames)) {
      if (Object.hasOwn(workflow.knowledge || {}, id) && text(label))
        metadata.sourceNames[id] = label;
      else stale("source label", id);
    }
  for (const g of list(value.groups))
    if (object(g) && text(g.id) && text(g.label)) {
      const members = list(g.members).filter(
        (id): id is string => typeof id === "string" && nodes.has(id),
      );
      if (members.length !== list(g.members).length)
        stale("group members", g.id);
      metadata.groups.push({
        id: g.id,
        label: g.label,
        members: [...new Set(members)],
      });
    }
  for (const v of list(value.views))
    if (object(v) && text(v.id) && text(v.name)) {
      const seen = new Set<string>(),
        visibleRoutes: RouteRef[] = [];
      for (const ref of list(v.visibleRoutes)) {
        if (object(ref) && text(ref.source) && text(ref.edgeId)) {
          const clean = { source: ref.source, edgeId: ref.edgeId },
            key = routeKey(clean);
          if (routes.has(key)) {
            if (!seen.has(key)) visibleRoutes.push(clean);
            seen.add(key);
          } else stale("route", key);
        }
      }
      metadata.views.push({ id: v.id, name: v.name, visibleRoutes });
    }
  for (const p of list(value.presentation))
    if (
      object(p) &&
      text(p.target) &&
      nodes.has(p.target) &&
      ["auto", "lines", "chips"].includes(String(p.mode))
    )
      metadata.presentation.push({
        target: p.target,
        mode: p.mode as "auto" | "lines" | "chips",
      });
  return { metadata, notices };
}
