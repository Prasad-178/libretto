import { applyTransaction } from "./studio/yaml-edits";
import { readWorkflow, type FlowNode } from "./workflow";

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
export function insertStep(
  source: string,
  selection: EdgeSelection,
  kind: StepKind,
  tool = "",
): { source: string; id: string } {
  const workflow = readWorkflow(source);
  if (!workflow) throw new Error("Fix the YAML before adding a step.");
  if (Object.keys(workflow.nodes).length >= 64)
    throw new Error("A workflow can contain up to 64 steps.");
  const index = edgeIndex(source, selection);
  const edge = workflow.nodes[selection.source].edges[index];
  // A terminal inserted in the middle can silently orphan downstream stages.
  if (kind === "end")
    throw new Error("Connect this transition to an existing end step instead.");
  if (edge.timing === "before_action")
    throw new Error(
      "Insert before the confirmation step instead. This connection protects an action.",
    );
  if (
    kind === "action" &&
    !(
      (workflow as typeof workflow & { tools?: string[] }).tools || []
    ).includes(tool)
  )
    throw new Error("Choose a registered action.");
  let id: string =
    kind === "conversation"
      ? "new_step"
      : kind === "say"
        ? "say_message"
        : "run_action";
  const base = id;
  for (let i = 2; Object.hasOwn(workflow.nodes, id); i++) id = `${base}_${i}`;
  const template =
    kind === "action"
      ? Object.values(workflow.nodes).find(
          (node) => node.kind === "action" && node.tool === tool,
        )
      : undefined;
  const node: Partial<FlowNode> = {
    ...(template || {}),
    kind,
    title:
      kind === "conversation"
        ? "New conversation"
        : kind === "say"
          ? "Say something"
          : "Run action",
    ...(kind === "conversation"
      ? { prompt: "Describe what the agent should do here." }
      : kind === "say"
        ? { text: "Thanks. Let’s continue." }
        : { tool }),
    edges: [{ id: "continue", to: edge.to }],
  };
  return {
    source: applyTransaction(source, {
      label: "Insert step",
      operations: [
        { op: "set", path: ["nodes", id], value: node },
        {
          op: "set",
          path: ["nodes", selection.source, "edges", index, "to"],
          value: id,
        },
      ],
    }).source,
    id,
  };
}
