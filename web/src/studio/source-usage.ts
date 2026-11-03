import { readWorkflow, type Workflow } from "../workflow";
import { applyTransaction } from "./yaml-edits";
import type { EditOperation } from "./types";
export type CollectionUsage =
  { kind: "all" } | { kind: "steps"; stepIds: string[] };
export function effectiveSources(workflow: Workflow, stepId: string): string[] {
  return [
    ...new Set([
      ...(workflow.common_knowledge || []),
      ...(workflow.nodes[stepId]?.knowledge || []),
    ]),
  ];
}
export function setCollectionUsage(
  source: string,
  sourceId: string,
  usage: CollectionUsage,
): string {
  const workflow = readWorkflow(source);
  if (!workflow || !Object.hasOwn(workflow.knowledge || {}, sourceId))
    throw new Error("Choose an existing collection.");
  if (
    usage.kind === "steps" &&
    usage.stepIds.some((id) => !Object.hasOwn(workflow.nodes, id))
  )
    throw new Error("Choose existing steps for this collection.");
  const common = (workflow.common_knowledge || []).filter(
    (id) => id !== sourceId,
  );
  const operations: EditOperation[] = [
    {
      op: "set",
      path: ["common_knowledge"],
      value: usage.kind === "all" ? [...common, sourceId] : common,
    },
  ];
  for (const [id, node] of Object.entries(workflow.nodes)) {
    const sources = (node.knowledge || []).filter(
      (source) => source !== sourceId,
    );
    if (usage.kind === "steps" && usage.stepIds.includes(id))
      sources.push(sourceId);
    if (node.knowledge || sources.length)
      operations.push({
        op: "set",
        path: ["nodes", id, "knowledge"],
        value: sources,
      });
  }
  return applyTransaction(source, {
    label: "Change collection usage",
    operations,
  }).source;
}
export function removeCollection(source: string, sourceId: string): string {
  const scoped = setCollectionUsage(source, sourceId, {
    kind: "steps",
    stepIds: [],
  });
  return applyTransaction(scoped, {
    label: "Detach collection",
    operations: [{ op: "delete", path: ["knowledge", sourceId] }],
  }).source;
}
