import type { Workflow } from "../workflow";
export function fieldReferences(
  workflow: Workflow,
  field: string,
): { nodeId: string; kind: string }[] {
  const refs: { nodeId: string; kind: string }[] = [];
  const predicate = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    const p = value as { field?: string; conditions?: unknown[] };
    return p.field === field || !!p.conditions?.some(predicate);
  };
  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    if ((node.edges || []).some((e) => predicate(e.predicate)))
      refs.push({ nodeId, kind: "state check" });
    if (node.requires?.includes(field)) refs.push({ nodeId, kind: "required" });
    if (Object.values(node.arguments || {}).includes(field))
      refs.push({ nodeId, kind: "argument" });
    if (node.readback?.includes(`{${field}}`))
      refs.push({ nodeId, kind: "readback" });
  }
  return refs;
}
