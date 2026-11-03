import { readWorkflow, type FlowEdge, type Workflow } from "../workflow";
import { edgeIndex } from "../studio-editing";
import { applyTransaction } from "./yaml-edits";
import type { RouteRef } from "./types";
import type { ToolManifest } from "./tool-manifest";
export type NewStepSpec =
  | {
      kind: "conversation";
      title: string;
      prompt: string;
      continuation: { condition: string } | { predicate: unknown };
    }
  | { kind: "say"; title: string; text: string }
  | {
      kind: "action";
      title: string;
      tool: ToolManifest;
      arguments: Record<string, string>;
      requires: string[];
      resultDestinations: Record<string, string>;
    };
function workflowFrom(source: string): Workflow {
  const workflow = readWorkflow(source);
  if (!workflow) throw new Error("Fix YAML syntax before editing the graph.");
  return workflow;
}
function destination(workflow: Workflow, id: string) {
  if (!Object.hasOwn(workflow.nodes, id))
    throw new Error(`Unknown destination ${id}.`);
}
export function validatePredicate(
  predicate: unknown,
  workflow: Workflow,
  depth = 0,
): void {
  if (!predicate || typeof predicate !== "object" || depth > 8)
    throw new Error("Choose a valid state check (maximum nesting: 8).");
  const p = predicate as {
    op: string;
    field?: string;
    value?: unknown;
    conditions?: unknown[];
  };
  if (["equals", "exists"].includes(p.op)) {
    const field = workflow.fields?.[p.field || ""];
    if (!field) throw new Error("Choose an existing field for this check.");
    if (
      p.op === "equals" &&
      typeof p.value !== (field.type === "boolean" ? "boolean" : "string")
    )
      throw new Error(`Use a ${field.type} value for ${p.field}.`);
  } else if (
    ["all", "any", "not"].includes(p.op) &&
    Array.isArray(p.conditions) &&
    p.conditions.length &&
    (p.op !== "not" || p.conditions.length === 1)
  )
    p.conditions.forEach((c) => validatePredicate(c, workflow, depth + 1));
  else throw new Error("Choose a valid state check.");
}
export function validateAction(
  workflow: Workflow,
  tool: ToolManifest,
  args: Record<string, string>,
  requires: string[],
  destinations?: Record<string, string>,
): void {
  if (!(workflow.tools || []).includes(tool.name))
    throw new Error(
      "Choose an action registered in this workflow and runtime.",
    );
  for (const name of Object.keys(args))
    if (!tool.parameters.some((p) => p.name === name))
      throw new Error(`Unknown action parameter ${name}.`);
  for (const p of tool.parameters) {
    const field = args[p.name];
    if (!field) {
      if (p.required)
        throw new Error(`Map the ${p.name} parameter to a field.`);
      continue;
    }
    if (
      !Object.hasOwn(workflow.fields || {}, field) ||
      workflow.fields![field].type !== p.type
    )
      throw new Error(`Map ${p.name} to an existing ${p.type} field.`);
    if (!requires.includes(field))
      throw new Error(
        `Mark ${field} as a required fact before running this action.`,
      );
  }
  for (const field of requires)
    if (!Object.hasOwn(workflow.fields || {}, field))
      throw new Error(`Unknown required field ${field}.`);
  if (destinations) {
    for (const result of tool.results) {
      if (!destinations[result])
        throw new Error(`Choose a destination for result ${result}.`);
      destination(workflow, destinations[result]);
    }
    for (const result of Object.keys(destinations))
      if (!tool.results.includes(result))
        throw new Error(`Unknown result ${result}.`);
  }
}
export function insertConfiguredStep(
  source: string,
  ref: RouteRef,
  spec: NewStepSpec,
): { source: string; nodeId: string } {
  const workflow = workflowFrom(source);
  if (Object.keys(workflow.nodes).length >= 64)
    throw new Error("A workflow can contain up to 64 steps.");
  const index = edgeIndex(source, ref),
    original = workflow.nodes[ref.source].edges[index];
  if (original.timing === "before_action")
    throw new Error(
      "Insert before the confirmation step. This connection protects an action.",
    );
  if (!spec.title.trim()) throw new Error("Give the new step a title.");
  const base =
    spec.title
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_|_$/g, "") || "new_step";
  let nodeId = base;
  for (let i = 2; Object.hasOwn(workflow.nodes, nodeId); i++)
    nodeId = `${base}_${i}`;
  let node: Record<string, unknown>;
  if (spec.kind === "conversation") {
    if (!spec.prompt.trim())
      throw new Error("Add instructions for the new conversation step.");
    if ("condition" in spec.continuation) {
      if (!spec.continuation.condition.trim())
        throw new Error("Add an explicit continuation condition.");
    } else validatePredicate(spec.continuation.predicate, workflow);
    node = {
      kind: spec.kind,
      title: spec.title,
      prompt: spec.prompt,
      edges: [{ id: "continue", to: original.to, ...spec.continuation }],
    };
  } else if (spec.kind === "say") {
    if (!spec.text.trim()) throw new Error("Write the exact message to speak.");
    node = {
      kind: spec.kind,
      title: spec.title,
      text: spec.text,
      edges: [{ id: "spoken", to: original.to }],
    };
  } else {
    validateAction(
      workflow,
      spec.tool,
      spec.arguments,
      spec.requires,
      spec.resultDestinations,
    );
    if (!spec.tool.results.length)
      throw new Error(
        "This action has no declared results. Configure its runtime manifest first.",
      );
    node = {
      kind: spec.kind,
      title: spec.title,
      tool: spec.tool.name,
      arguments: Object.fromEntries(
        Object.entries(spec.arguments).filter(([, field]) => field),
      ),
      requires: spec.requires,
      edges: spec.tool.results.map((result, i) => ({
        id: `result_${i + 1}`,
        to: spec.resultDestinations[result],
        result,
      })),
    };
  }
  const total =
    Object.values(workflow.nodes).reduce(
      (sum, n) => sum + (n.edges?.length || 0),
      0,
    ) + (node.edges as unknown[]).length;
  if (total > 256)
    throw new Error("A workflow supports up to 256 transitions.");
  return {
    nodeId,
    source: applyTransaction(source, {
      label: `Insert ${spec.title}`,
      operations: [
        { op: "set", path: ["nodes", nodeId], value: node },
        {
          op: "set",
          path: ["nodes", ref.source, "edges", index, "to"],
          value: nodeId,
        },
      ],
    }).source,
  };
}
export function reconnectRoute(
  source: string,
  ref: RouteRef,
  target: string,
): string {
  const workflow = workflowFrom(source);
  destination(workflow, target);
  return applyTransaction(source, {
    label: "Reconnect route",
    operations: [
      {
        op: "set",
        path: ["nodes", ref.source, "edges", edgeIndex(source, ref), "to"],
        value: target,
      },
    ],
  }).source;
}
export function createRoute(
  source: string,
  sourceId: string,
  edge: FlowEdge,
): string {
  const workflow = workflowFrom(source),
    node = workflow.nodes[sourceId];
  if (!node) throw new Error("Choose an existing source step.");
  if (node.kind === "end")
    throw new Error("End steps cannot have outgoing routes.");
  if (node.kind === "say" && (node.edges || []).length)
    throw new Error(
      "Say steps follow their first continuation; reconnect it instead.",
    );
  if (!edge.id.trim()) throw new Error("Give the route an ID.");
  if ((node.edges || []).some((e) => e.id === edge.id))
    throw new Error("This route ID already exists on this step.");
  destination(workflow, edge.to);
  if (node.kind === "action" && !edge.result)
    throw new Error("Choose an action result for this route.");
  if (node.kind === "conversation") {
    if (!edge.condition?.trim() && !edge.predicate)
      throw new Error("Add a language condition or state check.");
    if (edge.condition?.trim() && edge.predicate)
      throw new Error(
        "Choose a language condition or a state check for a new route.",
      );
    if (edge.predicate) validatePredicate(edge.predicate, workflow);
  }
  if (
    Object.values(workflow.nodes).reduce(
      (sum, n) => sum + (n.edges?.length || 0),
      0,
    ) >= 256
  )
    throw new Error("A workflow supports up to 256 transitions.");
  return applyTransaction(source, {
    label: "Create route",
    operations: [
      {
        op: "set",
        path: ["nodes", sourceId, "edges"],
        value: [...(node.edges || []), edge],
      },
    ],
  }).source;
}
