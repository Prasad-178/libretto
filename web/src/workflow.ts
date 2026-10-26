import { parseDocument } from "yaml";
export type FlowNode = {
  kind: string;
  title: string;
  prompt: string;
  text?: string;
  tools: string[];
  tool?: string;
  patient: boolean;
  entry?: string;
  edges: {
    id: string;
    to: string;
    condition?: string;
    result?: string;
    predicate?: unknown;
  }[];
};
export type Workflow = {
  id: string;
  name: string;
  description: string;
  shared_prompt: string;
  start: string;
  models: { speaker: string; evaluator: string };
  fields?: Record<string, { type: string; description: string }>;
  knowledge?: Record<string, string>;
  nodes: Record<string, FlowNode>;
};
export function readWorkflow(source: string): Workflow | null {
  try {
    const document = parseDocument(source);
    if (document.errors.length) return null;
    const value = document.toJS({ maxAliasCount: 0 });
    if (
      !value ||
      typeof value.name !== "string" ||
      typeof value.shared_prompt !== "string" ||
      !value.nodes ||
      Array.isArray(value.nodes) ||
      typeof value.nodes !== "object"
    )
      return null;
    if (
      !Object.values(value.nodes).every(
        (node: any) =>
          node &&
          typeof node === "object" &&
          typeof node.kind === "string" &&
          ((node.kind === "end" && node.edges === undefined) ||
            (Array.isArray(node.edges) &&
              node.edges.every(
                (edge: any) =>
                  edge &&
                  typeof edge.to === "string" &&
                  typeof edge.id === "string",
              ))),
      )
    )
      return null;
    return value as Workflow;
  } catch {
    return null;
  }
}
export function setYamlValue(
  source: string,
  path: string[],
  value: string,
): string {
  const document = parseDocument(source);
  if (document.errors.length)
    throw new Error("Fix YAML syntax before using the form.");
  document.setIn(path, value);
  return document.toString({ lineWidth: 0 });
}
