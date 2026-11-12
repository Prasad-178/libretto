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

/** ID/path edits and all executable/display references form one Undo entry. */
export function editCollection(
  source: string,
  currentId: string,
  id: string,
  path: string,
  metadata: import("./types").StudioMetadata,
): import("./types").DocumentTransaction {
  const workflow = readWorkflow(source);
  if (!workflow || !Object.hasOwn(workflow.knowledge || {}, currentId))
    throw new Error("Choose an existing collection.");
  if (!id.trim()) throw new Error("Enter a collection ID.");
  if (id !== currentId && Object.hasOwn(workflow.knowledge || {}, id))
    throw new Error("This collection ID already exists.");
  if (
    !path.trim() ||
    path.startsWith("/") ||
    path.split(/[\\/]/).includes("..")
  )
    throw new Error("Use a relative folder inside the project.");
  const operations: EditOperation[] = [];
  if (id !== currentId) {
    operations.push({
      op: "rename",
      path: ["knowledge", currentId],
      value: id,
    });
    const references = [
      ["common_knowledge"],
      ...Object.keys(workflow.nodes).map((node) => [
        "nodes",
        node,
        "knowledge",
      ]),
    ];
    for (const ref of references) {
      const items =
        ref.length === 1
          ? workflow.common_knowledge
          : workflow.nodes[ref[1]].knowledge;
      items?.forEach((value, index) => {
        if (value === currentId)
          operations.push({ op: "set", path: [...ref, index], value: id });
      });
    }
  }
  operations.push({ op: "set", path: ["knowledge", id], value: path });
  const names: Record<string, string> = Object.assign(
    Object.create(null),
    metadata.sourceNames,
  );
  if (id !== currentId && Object.hasOwn(names, currentId)) {
    names[id] = names[currentId];
    delete names[currentId];
  }
  return {
    label: "Edit collection",
    operations,
    metadata: { ...metadata, sourceNames: names },
  };
}
