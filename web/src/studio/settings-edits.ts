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

export function requestEdit(
  source: string,
  id: string,
  fields: string[],
): DocumentTransaction {
  const w = workflowFrom(source);
  for (const field of fields) {
    if (!Object.hasOwn(w.fields || {}, field))
      throw new Error(`Unknown field ${field}.`);
    for (const [other, request] of Object.entries(w.requests || {})) {
      if (other !== id && (request.fields || []).includes(field))
        throw new Error(`${field} already belongs to task ${other}.`);
    }
  }
  for (const [key, rule] of Object.entries(w.confirmations || {})) {
    if (rule.request !== id) continue;
    const missing = [
      ...rule.fields,
      rule.acceptance_field,
      ...(rule.consent_field ? [rule.consent_field] : []),
    ].filter((field) => !fields.includes(field));
    if (missing.length)
      throw new Error(
        `Rule ${key} still requires ${missing.join(", ")}. Update that rule first.`,
      );
    for (const [nodeId, node] of Object.entries(w.nodes)) {
      if (
        node.confirmation === key &&
        node.kind === "action" &&
        [...(node.requires || []), ...Object.values(node.arguments || {})].some(
          (field) => !fields.includes(field),
        )
      )
        throw new Error(
          `${nodeId} still uses fields in this task. Update that action first.`,
        );
    }
  }
  return {
    label: `Edit task ${id}`,
    operations: [
      {
        op: "set",
        path: ["requests", id, "fields"],
        value: [...new Set(fields)],
      },
    ],
  };
}

export function validateStep(w: Workflow, id: string): void {
  const node = Object.hasOwn(w.nodes, id) ? w.nodes[id] : undefined;
  if (!node) throw new Error("This step no longer exists.");
  if ([...(node.readback || "")].length > 4000)
    throw new Error("Keep readbacks within 4,000 characters.");
  const rule =
    node.confirmation && Object.hasOwn(w.confirmations || {}, node.confirmation)
      ? w.confirmations![node.confirmation]
      : undefined;
  if (node.confirmation && !rule)
    throw new Error("Choose an existing confirmation rule.");
  if (node.readback || (node.confirmation && node.kind !== "action")) {
    if (node.kind !== "conversation")
      throw new Error(
        "A readback requires a Conversation step. Clear it explicitly before changing kind.",
      );
    if (node.entry !== "respond")
      throw new Error("Choose Speak first for this readback step.");
    if (!node.readback)
      throw new Error(
        "Enter the message that reads the protected details back.",
      );
    validateReadback(
      node.readback,
      Object.keys(w.fields || {}),
      rule?.fields || [],
    );
  }
  if (node.begin_request) {
    if (node.kind !== "conversation")
      throw new Error(
        "Only a Conversation step can begin a task. Clear that binding explicitly before converting.",
      );
    if (!Object.hasOwn(w.requests || {}, node.begin_request))
      throw new Error("Choose an existing task.");
    if (rule && node.begin_request !== rule.request)
      throw new Error(
        "The step and its confirmation rule must use the same task.",
      );
  }
  if (node.kind === "say" && !node.text)
    throw new Error("Enter the exact message for a Say step.");
  if (node.kind === "action" && !node.tool)
    throw new Error("Choose an action tool before converting to Action.");
  if (node.kind !== "end" && !node.edges?.length)
    throw new Error(
      "Add an outgoing connection before converting this terminal step.",
    );
  for (const tool of [...(node.tools || []), ...(node.tool ? [node.tool] : [])])
    if (!w.tools?.includes(tool))
      throw new Error(`Tool ${tool} is not enabled for this workflow.`);
  for (const source of node.knowledge || [])
    if (!Object.hasOwn(w.knowledge || {}, source))
      throw new Error(`Unknown knowledge collection ${source}.`);
}

/** Validate the complete staged transaction, allowing temporary form inconsistencies. */
export function validateSettingsChanges(
  originalSource: string,
  source: string,
  operations: readonly EditOperation[],
): void {
  const w = workflowFrom(source),
    original = workflowFrom(originalSource);
  if (w.version !== 1)
    throw new Error("Choose the supported schema version 1.");
  if (!Object.hasOwn(w.nodes, w.start))
    throw new Error("Choose an existing starting step.");
  for (const [id, request] of Object.entries(w.requests || {}))
    requestEdit(source, id, request.fields || []);
  for (const [id, rule] of Object.entries(w.confirmations || {}))
    confirmationEdit(source, id, rule);
  for (const id of Object.keys(w.nodes)) {
    try {
      validateStep(w, id);
    } catch (error) {
      throw new Error(`${id}: ${(error as Error).message}`);
    }
  }
  const renamed = (kind: DefinitionKind, initial: string) => {
    let id = initial;
    for (const op of operations)
      if (op.op === "rename" && op.path[0] === kind && op.path[1] === id)
        id = op.value;
    return id;
  };
  for (const [oldId, oldRule] of Object.entries(original.confirmations || {})) {
    const id = renamed("confirmations", oldId),
      next = Object.hasOwn(w.confirmations || {}, id)
        ? w.confirmations![id]
        : undefined;
    if (!next) continue;
    for (const key of ["acceptance_field", "consent_field"] as const) {
      const oldFlag = oldRule[key] && renamed("fields", oldRule[key]!);
      if (!oldFlag || oldFlag === next[key]) continue;
      const uses = fieldReferences(w, oldFlag).filter(
        (ref) =>
          w.nodes[ref.nodeId].confirmation === id ||
          w.nodes[ref.nodeId].begin_request === next.request,
      );
      if (uses.length)
        throw new Error(
          `Field ${oldFlag} is still used by ${[...new Set(uses.map((ref) => ref.nodeId))].join(", ")}. Update those predicates/arguments before rebinding this rule’s flag.`,
        );
    }
  }
}
