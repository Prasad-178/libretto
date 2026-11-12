/** Reference-aware settings commands. These never rewrite user prompt text. */
import { readWorkflow, type Workflow } from "../workflow";
import type {
  DocumentTransaction,
  EditOperation,
  StudioMetadata,
} from "./types";
import { fieldReferences } from "./field-references";

export type DefinitionKind = "fields" | "nodes" | "requests" | "confirmations";
export type Confirmation = NonNullable<Workflow["confirmations"]>[string];
function workflowFrom(source: string): Workflow {
  const workflow = readWorkflow(source);
  if (!workflow)
    throw new Error("Fix the YAML structure before changing settings.");
  return workflow;
}
export function definitionUses(
  w: Workflow,
  kind: DefinitionKind,
  id: string,
): string[] {
  const refs = new Set<string>();
  for (const [nodeId, node] of Object.entries(w.nodes)) {
    if (kind === "nodes" && node.edges?.some((edge) => edge.to === id))
      refs.add(nodeId);
    if (kind === "requests" && node.begin_request === id) refs.add(nodeId);
    if (kind === "confirmations" && node.confirmation === id) refs.add(nodeId);
  }
  if (kind === "nodes" && w.start === id) refs.add("start");
  if (kind === "fields") {
    fieldReferences(w, id).forEach((ref) => refs.add(ref.nodeId));
    Object.entries(w.requests || {}).forEach(([key, value]) => {
      if (value.fields.includes(id)) refs.add(`task ${key}`);
    });
    Object.entries(w.confirmations || {}).forEach(([key, value]) => {
      if (
        [...value.fields, value.acceptance_field, value.consent_field].includes(
          id,
        )
      )
        refs.add(`rule ${key}`);
    });
  }
  if (kind === "requests")
    Object.entries(w.confirmations || {}).forEach(([key, rule]) => {
      if (rule.request === id) refs.add(key);
    });
  return [...refs];
}
export function removeDefinition(
  source: string,
  kind: DefinitionKind,
  id: string,
): DocumentTransaction {
  const w = workflowFrom(source);
  if (!Object.hasOwn(w[kind] || {}, id))
    throw new Error("This definition no longer exists.");
  const uses = definitionUses(w, kind, id);
  if (uses.length)
    throw new Error(
      `Still used by ${uses.join(", ")}. Update these references first.`,
    );
  return {
    label: `Remove ${id}`,
    operations: [{ op: "delete", path: [kind, id] }],
  };
}
function renameMetadata(
  metadata: StudioMetadata,
  from: string,
  to: string,
): StudioMetadata {
  return {
    ...metadata,
    positions: Object.fromEntries(
      Object.entries(metadata.positions).map(([id, point]) => [
        id === from ? to : id,
        point,
      ]),
    ),
    groups: metadata.groups.map((group) => ({
      ...group,
      members: group.members.map((id) => (id === from ? to : id)),
    })),
    views: metadata.views.map((view) => ({
      ...view,
      visibleRoutes: view.visibleRoutes.map((route) => ({
        ...route,
        source: route.source === from ? to : route.source,
      })),
    })),
    presentation: metadata.presentation.map((hint) => ({
      ...hint,
      target: hint.target === from ? to : hint.target,
    })),
  };
}
export function renameDefinition(
  source: string,
  kind: DefinitionKind,
  from: string,
  to: string,
  metadata?: StudioMetadata,
): DocumentTransaction {
  const w = workflowFrom(source);
  const definitions = w[kind] || {};
  if (!Object.hasOwn(definitions, from))
    throw new Error("This definition no longer exists.");
  if (!to.trim()) throw new Error("Enter a non-empty ID.");
  if (from === to) return { label: "Keep ID", operations: [] };
  if (Object.hasOwn(definitions, to))
    throw new Error(`ID ${to} already exists.`);
  const operations: EditOperation[] = [];
  const set = (path: (string | number)[], value: unknown) =>
    operations.push({ op: "set", path, value });
  const list = (path: (string | number)[], values: string[] | undefined) => {
    if (values?.includes(from))
      set(
        path,
        values.map((id) => (id === from ? to : id)),
      );
  };
  const predicate = (value: unknown, path: (string | number)[]) => {
    if (!value || typeof value !== "object") return;
    const p = value as { field?: string; conditions?: unknown[] };
    if (p.field === from) set([...path, "field"], to);
    p.conditions?.forEach((child, i) =>
      predicate(child, [...path, "conditions", i]),
    );
  };
  if (kind === "nodes" && w.start === from) set(["start"], to);
  for (const [id, node] of Object.entries(w.nodes)) {
    const path = ["nodes", id];
    if (kind === "nodes")
      node.edges?.forEach((edge, index) => {
        if (edge.to === from) set([...path, "edges", index, "to"], to);
      });
    if (kind === "requests" && node.begin_request === from)
      set([...path, "begin_request"], to);
    if (kind === "confirmations" && node.confirmation === from)
      set([...path, "confirmation"], to);
    if (kind === "fields") {
      list([...path, "requires"], node.requires);
      Object.entries(node.arguments || {}).forEach(([key, value]) => {
        if (value === from) set([...path, "arguments", key], to);
      });
      if (node.readback?.includes(`{${from}}`)) {
        let readback = node.readback;
        const references = readbackTokens(readback).filter(
          (token) => token.field === from,
        );
        if (references.length) validateReadback(`{${to}}`, [to], []);
        for (const token of references.reverse())
          readback =
            readback.slice(0, token.start) +
            `{${to}}` +
            readback.slice(token.end);
        if (readback !== node.readback) set([...path, "readback"], readback);
      }
      node.edges?.forEach((edge, index) =>
        predicate(edge.predicate, [...path, "edges", index, "predicate"]),
      );
    }
  }
  if (kind === "fields")
    Object.entries(w.requests || {}).forEach(([key, request]) =>
      list(["requests", key, "fields"], request.fields),
    );
  Object.entries(w.confirmations || {}).forEach(([key, rule]) => {
    const path = ["confirmations", key];
    if (kind === "requests" && rule.request === from)
      set([...path, "request"], to);
    if (kind === "fields") {
      list([...path, "fields"], rule.fields);
      for (const key of ["acceptance_field", "consent_field"] as const)
        if (rule[key] === from) set([...path, key], to);
    }
  });
  operations.push({ op: "rename", path: [kind, from], value: to });
  return {
    label: `Rename ${from} to ${to}`,
    operations,
    ...(kind === "nodes" && metadata
      ? { metadata: renameMetadata(metadata, from, to) }
      : {}),
  };
}

/** Python-format-compatible plain fields, with doubled braces retained as literals. */
export function readbackTokens(
  text: string,
): { field: string; start: number; end: number }[] {
  const tokens: { field: string; start: number; end: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== "{" && c !== "}") continue;
    if (text[i + 1] === c) {
      i++;
      continue;
    }
    if (c === "}") throw new Error("Unmatched closing brace in readback.");
    const end = text.indexOf("}", i + 1);
    if (end < 0) throw new Error("Unmatched opening brace in readback.");
    const field = text.slice(i + 1, end);
    if (!field || /[{}!:]/.test(field))
      throw new Error("Use plain field names inside braces.");
    tokens.push({ field, start: i, end: end + 1 });
    i = end;
  }
  return tokens;
}
export function validateReadback(
  text: string,
  fields: string[],
  required: string[],
): string[] {
  const found = new Set(readbackTokens(text).map((token) => token.field));
  for (const field of found)
    if (!fields.includes(field))
      throw new Error(`Unknown readback field ${field}.`);
  const missing = required.filter((field) => !found.has(field));
  if (missing.length)
    throw new Error(`Readback must include ${missing.join(", ")}.`);
  return [...found];
}
export function confirmationEdit(
  source: string,
  id: string,
  rule: Confirmation,
): DocumentTransaction {
  const w = workflowFrom(source);
  const scope = w.requests?.[rule.request]?.fields;
  if (!scope) throw new Error("Choose an existing task for this rule.");
  if (
    !rule.fields.length ||
    rule.fields.some((field) => !scope.includes(field))
  )
    throw new Error("Choose at least one detail belonging to this task.");
  if (
    rule.fields.includes(rule.acceptance_field) ||
    rule.acceptance_field === rule.consent_field
  )
    throw new Error(
      "Approval and consent must be separate from each other and from protected details.",
    );
  for (const flag of [rule.acceptance_field, rule.consent_field].filter(
    Boolean,
  ) as string[]) {
    if (!scope.includes(flag) || w.fields?.[flag]?.type !== "boolean")
      throw new Error(`${flag} must be a boolean field in this task.`);
  }
  for (const [nodeId, node] of Object.entries(w.nodes)) {
    if (node.confirmation !== id) continue;
    if (node.begin_request && node.begin_request !== rule.request)
      throw new Error(
        `${nodeId} begins a different task. Update that binding first.`,
      );
    if (
      node.kind === "action" &&
      [...(node.requires || []), ...Object.values(node.arguments || {})].some(
        (field) => !scope.includes(field),
      )
    )
      throw new Error(`${nodeId} uses fields outside this task.`);
    if (node.readback)
      try {
        validateReadback(
          node.readback,
          Object.keys(w.fields || {}),
          rule.fields,
        );
      } catch (error) {
        throw new Error(`${nodeId}: ${(error as Error).message}`);
      }
  }
  return {
    label: `Edit confirmation ${id}`,
    operations: [{ op: "set", path: ["confirmations", id], value: rule }],
  };
}
