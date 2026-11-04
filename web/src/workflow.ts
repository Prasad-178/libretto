import { parseDocument } from "yaml";
import { applyTransaction } from "./studio/yaml-edits";
export type FlowEdge = {
  id: string;
  to: string;
  label?: string;
  condition?: string;
  result?: string;
  predicate?: unknown;
  timing?: string;
};
export type FlowNode = {
  begin_request?: string;
  confirmation?: string;
  kind: string;
  title: string;
  prompt: string;
  text?: string;
  readback?: string;
  tools: string[];
  tool?: string | null;
  knowledge?: string[];
  requires?: string[];
  arguments?: Record<string, string>;
  patient: boolean;
  entry?: string;
  edges: FlowEdge[];
};
export type Workflow = {
  evaluation_prompt?: string;
  requests?: Record<string, { fields: string[] }>;
  confirmations?: Record<
    string,
    {
      request: string;
      fields: string[];
      acceptance_field: string;
      consent_field?: string | null;
      require_delivery?: boolean;
    }
  >;
  id: string;
  name: string;
  description: string;
  shared_prompt: string;
  welcome?: string;
  start: string;
  models: {
    speaker: string;
    evaluator: string;
    reasoning?: "minimal" | "low" | "medium" | "high";
  };
  speech?: {
    engine?: "livekit" | "direct";
    credential_mode?: "inference" | "providers";
    stt: { provider: string; model: string; voice?: string | null };
    tts: { provider: string; model: string; voice?: string | null };
    hints?: string[];
  };
  fields?: Record<
    string,
    { type: string; description?: string; choices?: string[] }
  >;
  tools?: string[];
  knowledge?: Record<string, string>;
  common_knowledge?: string[];
  nodes: Record<string, FlowNode>;
};
export function readWorkflow(source: string): Workflow | null {
  try {
    if ([...source].length > 100_000) return null;
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
    const record = (v: unknown): v is Record<string, any> =>
      !!v && typeof v === "object" && !Array.isArray(v);
    if (!optionalText(value, ["description", "welcome", "evaluation_prompt"]))
      return null;
    if (
      value.fields !== undefined &&
      (!record(value.fields) ||
        !Object.values(value.fields).every(
          (field) =>
            record(field) &&
            ["string", "boolean"].includes(field.type ?? "string") &&
            optionalText(field, ["description"]) &&
            stringLists(field, ["choices"]),
        ))
    )
      return null;
    if (
      value.models !== undefined &&
      (!record(value.models) ||
        !optionalText(value.models, ["speaker", "evaluator", "reasoning"]))
    )
      return null;
    if (
      value.knowledge !== undefined &&
      (!record(value.knowledge) ||
        !Object.values(value.knowledge).every(
          (path) => typeof path === "string",
        ))
    )
      return null;
    if (
      value.speech &&
      ((value.speech.engine !== undefined &&
        !["livekit", "direct"].includes(value.speech.engine)) ||
        (value.speech.credential_mode !== undefined &&
          !["inference", "providers"].includes(value.speech.credential_mode)))
    )
      return null;
    if (
      value.speech !== undefined &&
      (!record(value.speech) ||
        !stringLists(value.speech, ["hints"]) ||
        !["stt", "tts"].every(
          (key) =>
            value.speech[key] === undefined ||
            (record(value.speech[key]) &&
              optionalText(value.speech[key], ["provider", "model"])),
        ))
    )
      return null;

    const predicateShape = (p: unknown, depth = 0): boolean =>
      p === undefined ||
      p === null ||
      (depth <= 8 &&
        record(p) &&
        typeof p.op === "string" &&
        optionalText(p, ["field"]) &&
        (p.conditions === undefined ||
          (Array.isArray(p.conditions) &&
            p.conditions.every((child) => predicateShape(child, depth + 1)))));
    if (
      !Object.values(value.nodes).every(
        (node: any) =>
          node &&
          typeof node === "object" &&
          typeof node.kind === "string" &&
          optionalText(node, [
            "title",
            "prompt",
            "text",
            "readback",
            "begin_request",
            "confirmation",
          ]) &&
          (node.tool === undefined ||
            node.tool === null ||
            typeof node.tool === "string") &&
          stringLists(node, ["tools", "knowledge", "requires"]) &&
          ((node.kind === "end" && node.edges === undefined) ||
            (Array.isArray(node.edges) &&
              node.edges.every(
                (edge: any) =>
                  edge &&
                  typeof edge.to === "string" &&
                  typeof edge.id === "string" &&
                  predicateShape(edge.predicate) &&
                  optionalText(edge, [
                    "label",
                    "condition",
                    "result",
                    "timing",
                  ]),
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
  return applyTransaction(source, {
    label: "Edit property",
    operations: [{ op: "set", path, value }],
  }).source;
}
