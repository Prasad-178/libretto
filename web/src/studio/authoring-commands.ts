/** Source-backed graph commands; presentation metadata never determines execution. */
import { readWorkflow } from "../workflow";
import { edgeIndex } from "../studio-editing";
import { validateAction } from "./editor-commands";
import type {
  DocumentTransaction,
  EditOperation,
  RouteRef,
  StudioMetadata,
} from "./types";
import type { ToolManifest } from "./tool-manifest";
function workflowFrom(source: string) {
  const workflow = readWorkflow(source);
  if (!workflow)
    throw new Error("Fix the YAML syntax before editing connections.");
  return workflow;
}
export function renameRoute(
  source: string,
  ref: RouteRef,
  id: string,
  metadata: StudioMetadata,
): DocumentTransaction {
  const workflow = workflowFrom(source),
    index = edgeIndex(source, ref);
  if (!id.trim()) throw new Error("Enter a route ID.");
  if (id === ref.edgeId)
    return { label: "Rename route", operations: [], metadata };
  if (workflow.nodes[ref.source].edges.some((e) => e.id === id))
    throw new Error("This route ID already exists on the step.");
  return {
    label: "Rename route",
    operations: [
      {
        op: "set",
        path: ["nodes", ref.source, "edges", index, "id"],
        value: id,
      },
    ],
    metadata: {
      ...metadata,
      views: metadata.views.map((view) => ({
        ...view,
        visibleRoutes: view.visibleRoutes.map((route) =>
          route.source === ref.source && route.edgeId === ref.edgeId
            ? { ...route, edgeId: id }
            : route,
        ),
      })),
    },
  };
}
export function moveRoute(
  source: string,
  ref: RouteRef,
  direction: -1 | 1,
): DocumentTransaction {
  const workflow = workflowFrom(source),
    index = edgeIndex(source, ref),
    to = index + direction;
  if (to < 0 || to >= workflow.nodes[ref.source].edges.length)
    throw new Error("This route is already at the end of the order.");
  return {
    label: "Reorder connection",
    operations: [
      { op: "move", path: ["nodes", ref.source, "edges"], from: index, to },
    ],
  };
}
export function configureAction(
  source: string,
  nodeId: string,
  tool: ToolManifest,
  args: Record<string, string>,
  requires: string[],
  destinations: Record<string, string>,
  replaceConnections = false,
): DocumentTransaction {
  const workflow = workflowFrom(source),
    node = workflow.nodes[nodeId];
  if (!node || node.kind !== "action")
    throw new Error("Choose an action step.");
  if (!tool.results.includes("failed") || !tool.results.includes("unknown"))
    throw new Error(
      "The Python action contract must declare failed and unknown recovery results.",
    );
  validateAction(workflow, tool, args, requires, destinations);
  for (const result of tool.results)
    if ((node.edges || []).filter((e) => e.result === result).length > 1)
      throw new Error(
        `Duplicate result ${result}; remove the extra connection before applying.`,
      );
  const obsolete = (node.edges || [])
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => !tool.results.includes(edge.result || ""));
  if (node.tool === tool.name && obsolete.length && !replaceConnections)
    throw new Error(
      "Remove unrecognized result connections before applying this action contract.",
    );
  const operations: EditOperation[] = [
    { op: "set", path: ["nodes", nodeId, "tool"], value: tool.name },
    {
      op: "set",
      path: ["nodes", nodeId, "arguments"],
      value: Object.fromEntries(
        Object.entries(args).filter(([, field]) => field),
      ),
    },
    { op: "set", path: ["nodes", nodeId, "requires"], value: requires },
    ...obsolete.reverse().map(({ index }) => ({
      op: "delete" as const,
      path: ["nodes", nodeId, "edges", index],
    })),
  ];
  const retained = (node.edges || []).filter((e) =>
    tool.results.includes(e.result || ""),
  );
  retained.forEach((edge, index) =>
    operations.push({
      op: "set",
      path: ["nodes", nodeId, "edges", index, "to"],
      value: destinations[edge.result!],
    }),
  );
  const ids = new Set(retained.map((e) => e.id));
  let nextIndex = retained.length;
  for (const result of tool.results)
    if (!retained.some((e) => e.result === result)) {
      let id = `result_${nextIndex + 1}`;
      while (ids.has(id)) id += "_";
      ids.add(id);
      operations.push({
        op: "set",
        path: ["nodes", nodeId, "edges", nextIndex++],
        value: { id, result, to: destinations[result] },
      });
    }
  return { label: "Configure action", operations };
}

/** Existing YAML bindings remain editable when the connected runtime lacks its contract. */
export function editActionBindings(
  source: string,
  nodeId: string,
  args: Record<string, string>,
  requires: string[],
  destinations: Record<string, string>,
): DocumentTransaction {
  const workflow = workflowFrom(source),
    node = workflow.nodes[nodeId];
  if (!node || node.kind !== "action" || !node.tool)
    throw new Error("Choose an action step with a tool ID.");
  const fields = workflow.fields || {};
  for (const [parameter, field] of Object.entries(args)) {
    if (!parameter.trim() || !Object.hasOwn(fields, field))
      throw new Error("Map each parameter to an existing field.");
    if (!requires.includes(field))
      throw new Error(`Mark ${field} as required before the action runs.`);
  }
  for (const field of requires)
    if (!Object.hasOwn(fields, field))
      throw new Error(`Unknown required field ${field}.`);
  const operations: EditOperation[] = [
    { op: "set", path: ["nodes", nodeId, "arguments"], value: args },
    { op: "set", path: ["nodes", nodeId, "requires"], value: requires },
  ];
  for (const [id, to] of Object.entries(destinations)) {
    const index = node.edges.findIndex((e) => e.id === id);
    if (index < 0) throw new Error("This result route no longer exists.");
    if (!Object.hasOwn(workflow.nodes, to))
      throw new Error("Choose an existing destination step.");
    operations.push({
      op: "set",
      path: ["nodes", nodeId, "edges", index, "to"],
      value: to,
    });
  }
  return { label: "Edit imported action bindings", operations };
}

/** Remove a connection without losing required action-result recovery paths. */
export function removeRoute(
  source: string,
  ref: RouteRef,
  metadata: StudioMetadata,
  tools: ToolManifest[],
): DocumentTransaction {
  const workflow = workflowFrom(source);
  const index = edgeIndex(source, ref);
  const node = workflow.nodes[ref.source];
  const edge = node.edges[index];
  if (node.kind !== "end" && node.edges.length === 1)
    throw new Error("Keep at least one connection from this step.");
  const contract = tools.find((tool) => tool.name === node.tool);
  if (
    node.kind === "action" &&
    edge.result &&
    contract?.results.includes(edge.result) &&
    node.edges.filter((item) => item.result === edge.result).length === 1
  )
    throw new Error(
      `The declared result ${edge.result} requires a connection. Change its destination instead.`,
    );
  return {
    label: "Delete connection",
    operations: [{ op: "delete", path: ["nodes", ref.source, "edges", index] }],
    metadata: {
      ...metadata,
      views: metadata.views.map((view) => ({
        ...view,
        visibleRoutes: view.visibleRoutes.filter(
          (item) => item.source !== ref.source || item.edgeId !== ref.edgeId,
        ),
      })),
    },
  };
}
