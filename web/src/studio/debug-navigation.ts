import type { Workflow } from "../workflow";

export type DiagnosticTarget =
  | { kind: "step"; node: string }
  | { kind: "route"; source: string; edgeId: string }
  | { kind: "policy"; node: string; policy: string };
export type DiagnosticRequest = {
  key: number;
  source: string;
  target: DiagnosticTarget;
};

/** IDs must resolve against the inspected definition. Text is never a navigation target. */
export function diagnosticTargets(
  data: Record<string, unknown>,
  workflow: Workflow,
): DiagnosticTarget[] {
  const targets: DiagnosticTarget[] = [];
  const source =
    typeof data.source === "string" &&
    Object.hasOwn(workflow.nodes, data.source)
      ? data.source
      : null;
  if (
    source &&
    typeof data.edge === "string" &&
    workflow.nodes[source].edges?.some((edge) => edge.id === data.edge)
  )
    targets.push({ kind: "route", source, edgeId: data.edge });
  const node =
    typeof data.node === "string" && Object.hasOwn(workflow.nodes, data.node)
      ? data.node
      : null;
  if (
    node &&
    typeof data.policy === "string" &&
    Object.hasOwn(workflow.confirmations || {}, data.policy) &&
    workflow.nodes[node].confirmation === data.policy
  )
    targets.push({ kind: "policy", node, policy: data.policy });
  return targets;
}
