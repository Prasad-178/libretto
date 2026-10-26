import { parseDocument } from "yaml";
export type FlowNode = {
  kind: string;
  title: string;
  prompt: string;
  text?: string;
  tools: string[];
  tool?: string;
  knowledge?: string[];
  requires?: string[];
  patient: boolean;
  entry?: string;
  edges: {
    id: string;
    to: string;
    condition?: string;
    result?: string;
    predicate?: unknown;
    timing?: string;
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
  common_knowledge?: string[];
  nodes: Record<string, FlowNode>;
};
export function readWorkflow(source: string): Workflow | null {
  try {
    if (source.length > 100_000) return null;
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
    const optionalText = (object: Record<string, unknown>, keys: string[]) =>
      keys.every(
        (key) => object[key] === undefined || typeof object[key] === "string",
      );
    const stringLists = (object: Record<string, unknown>, keys: string[]) =>
      keys.every(
        (key) =>
          object[key] === undefined ||
          (Array.isArray(object[key]) &&
            object[key].every((item: unknown) => typeof item === "string")),
      );
    if (!stringLists(value, ["common_knowledge"])) return null;
    if (
      !Object.values(value.nodes).every(
        (node: any) =>
          node &&
          typeof node === "object" &&
          typeof node.kind === "string" &&
          optionalText(node, ["title", "prompt", "text", "tool"]) &&
          stringLists(node, ["tools", "knowledge", "requires"]) &&
          ((node.kind === "end" && node.edges === undefined) ||
            (Array.isArray(node.edges) &&
              node.edges.every(
                (edge: any) =>
                  edge &&
                  typeof edge.to === "string" &&
                  typeof edge.id === "string" &&
                  optionalText(edge, ["condition", "result", "timing"]),
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
