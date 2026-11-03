import { applyTransaction } from "./studio/yaml-edits";
import { readWorkflow } from "./workflow";

export type EdgeSelection = { source: string; edgeId: string };
export type StepKind = "conversation" | "say" | "action" | "end";
export function editValue(
  source: string,
  path: (string | number)[],
  value: unknown,
): string {
  return applyTransaction(source, {
    label: "Edit property",
    operations: [{ op: "set", path, value }],
  }).source;
}
export function edgeIndex(source: string, selection: EdgeSelection): number {
  const index =
    readWorkflow(source)?.nodes[selection.source]?.edges?.findIndex(
      (e) => e.id === selection.edgeId,
    ) ?? -1;
  if (index < 0) throw new Error("This transition no longer exists.");
  return index;
}
export function editEdge(
  source: string,
  selection: EdgeSelection,
  key: string,
  value: unknown,
): string {
  return editValue(
    source,
    ["nodes", selection.source, "edges", edgeIndex(source, selection), key],
    value,
  );
}
