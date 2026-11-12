import { expect, it } from "vitest";
import { parse } from "yaml";
import repair from "../../../examples/repair_visit/agent.yaml?raw";
import { applyTransaction } from "./yaml-edits";
import {
  renameDefinition,
  removeDefinition,
  validateReadback,
  confirmationEdit,
  requestEdit,
  validateStep,
  validateSettingsChanges,
} from "./settings-edits";
import { createDocument, documentReducer } from "./document-store";

it("renames a field and its structured references without changing prompt text or comments", () => {
  const source = repair.replace(
    "  customer_name:",
    "  # keep caller field\n  customer_name:",
  );
  const tx = renameDefinition(source, "fields", "customer_name", "caller_name");
  const next = applyTransaction(source, tx).source;
  const w = parse(next);
  expect(w.fields.caller_name.type).toBe("string");
  expect(w.fields.customer_name).toBeUndefined();
  expect(w.requests.visit.fields).toContain("caller_name");
  expect(w.confirmations.booking.fields).toContain("caller_name");
  expect(w.nodes.book.arguments.customer_name).toBe("caller_name");
  expect(w.nodes.book.requires).toContain("caller_name");
  expect(w.nodes.confirm.readback).toContain("{caller_name}");
  expect(w.nodes.collect.edges[0].predicate.conditions[0].field).toBe(
    "caller_name",
  );
  expect(next).toContain("# keep caller field");
  expect(next).toContain(
    "shared_prompt: Help arrange a fictional repair visit. Only report booking after an actual tool receipt.",
  );
});

it("renames request/policy/node IDs and references atomically", () => {
  let source = applyTransaction(
    repair,
    renameDefinition(repair, "requests", "visit", "repair_job"),
  ).source;
  source = applyTransaction(
    source,
    renameDefinition(source, "confirmations", "booking", "approval"),
  ).source;
  source = applyTransaction(
    source,
    renameDefinition(source, "nodes", "collect", "intake"),
  ).source;
  const w = parse(source);
  expect(w.start).toBe("intake");
  expect(w.nodes.wrap.edges[0].to).toBe("intake");
  expect(w.nodes.intake.begin_request).toBe("repair_job");
  expect(w.confirmations.approval.request).toBe("repair_job");
  expect(w.nodes.confirm.confirmation).toBe("approval");
  expect(w.nodes.book.confirmation).toBe("approval");
});

it("refuses collisions and removal of referenced definitions with usage guidance", () => {
  expect(() => renameDefinition(repair, "fields", "address", "issue")).toThrow(
    /already exists/,
  );
  expect(() => removeDefinition(repair, "confirmations", "booking")).toThrow(
    /confirm.*book/,
  );
  expect(() => removeDefinition(repair, "requests", "visit")).toThrow(
    /booking|collect/,
  );
  expect(() => removeDefinition(repair, "nodes", "collect")).toThrow(
    /start|wrap/,
  );
});

it("validates exact placeholders, escaped braces and all protected fields", () => {
  expect(
    validateReadback("{{literal}} {address}", ["address"], ["address"]),
  ).toEqual(["address"]);
  expect(() =>
    validateReadback("Hello {address!r}", ["address"], ["address"]),
  ).toThrow(/plain/);
  expect(() => validateReadback("Hello {unknown}", ["address"], [])).toThrow(
    /unknown/,
  );
  expect(() => validateReadback("Hello {address", ["address"], [])).toThrow(
    /brace/,
  );
  expect(() => validateReadback("Hello", ["address"], ["address"])).toThrow(
    /address/,
  );
});

it("renames actual readback fields but preserves doubled-brace literal text", () => {
  const source = repair.replace(
    "Visit for {customer_name}",
    "Literal {{customer_name}}; visit for {customer_name}",
  );
  const next = parse(
    applyTransaction(
      source,
      renameDefinition(source, "fields", "customer_name", "caller_name"),
    ).source,
  );
  expect(next.nodes.confirm.readback).toContain(
    "Literal {{customer_name}}; visit for {caller_name}",
  );
});

it("renames node layout references in the same Undo entry", () => {
  const original = createDocument(
    "repair.yaml",
    new TextEncoder().encode(repair),
  );
  original.metadata.positions.collect = { x: 100, y: 200 };
  original.metadata.groups = [
    { id: "intake", label: "Intake", members: ["collect"] },
  ];
  original.metadata.views = [
    {
      id: "main",
      name: "Main",
      visibleRoutes: [{ source: "collect", edgeId: "complete" }],
    },
  ];
  const tx = renameDefinition(
    repair,
    "nodes",
    "collect",
    "intake",
    original.metadata,
  );
  const next = documentReducer(original, {
    type: "transaction",
    transaction: tx,
  });
  expect(next.metadata.positions.intake).toEqual({ x: 100, y: 200 });
  expect(next.metadata.positions.collect).toBeUndefined();
  expect(next.metadata.groups[0].members).toEqual(["intake"]);
  expect(next.metadata.views[0].visibleRoutes[0].source).toBe("intake");
  const restored = documentReducer(next, { type: "undo" });
  expect(restored.source).toBe(repair);
  expect(restored.metadata).toEqual(original.metadata);
});

it("checks every shared readback when editing a confirmation and preserves action bindings", () => {
  const source = repair.replace(
    "  wrap:\n",
    "  confirm_again:\n    kind: conversation\n    confirmation: booking\n    entry: respond\n    readback: 'Only {customer_name}'\n    edges: [{id: return, to: wrap}]\n  wrap:\n",
  );
  expect(() =>
    confirmationEdit(source, "booking", {
      ...parse(repair).confirmations.booking,
      fields: ["address"],
    }),
  ).toThrow(/confirm_again.*address/);
  const tx = confirmationEdit(repair, "booking", {
    ...parse(repair).confirmations.booking,
    require_delivery: false,
  });
  const next = parse(applyTransaction(repair, tx).source);
  expect(next.confirmations.booking.require_delivery).toBe(false);
  expect(next.nodes.book.confirmation).toBe("booking");
  expect(next.nodes.confirm.confirmation).toBe("booking");
});

it("keeps request memory disjoint and prevents dropping confirmation authority fields", () => {
  expect(() => requestEdit(repair, "other", ["address"])).toThrow(/visit/);
  expect(() =>
    requestEdit(repair, "visit", [
      "customer_name",
      "address",
      "issue",
      "window",
      "consent",
    ]),
  ).toThrow(/accepted/);
  const next = parse(
    applyTransaction(repair, requestEdit(repair, "other", [])).source,
  );
  expect(next.requests.other.fields).toEqual([]);
  expect(next.requests.visit.fields).toContain("accepted");
});

it("blocks invalid kind/entry changes instead of discarding readback settings", () => {
  const w = parse(repair);
  w.nodes.confirm.entry = "wait";
  expect(() => validateStep(w, "confirm")).toThrow(/Speak first/);
  w.nodes.confirm.kind = "say";
  expect(() => validateStep(w, "confirm")).toThrow(/readback|Readback/);
  expect(w.nodes.confirm.readback).toContain("{address}");
});

it("blocks flag rebinding that strands existing predicates but permits a complete field rename", () => {
  const operations = [
    {
      op: "set" as const,
      path: ["confirmations", "booking", "acceptance_field"],
      value: "consent",
    },
    {
      op: "set" as const,
      path: ["confirmations", "booking", "consent_field"],
      value: null,
    },
  ];
  const next = applyTransaction(repair, {
    label: "Change approval",
    operations,
  }).source;
  expect(() => validateSettingsChanges(repair, next, operations)).toThrow(
    /accepted.*confirm|confirm.*accepted/,
  );
  const rename = renameDefinition(repair, "fields", "accepted", "approved");
  expect(() =>
    validateSettingsChanges(
      repair,
      applyTransaction(repair, rename).source,
      rename.operations,
    ),
  ).not.toThrow();
});

it("does not mistake inherited object names for declared confirmation rules", () => {
  const w = parse(repair);
  w.nodes.confirm.confirmation = "constructor";
  expect(() => validateStep(w, "confirm")).toThrow(/existing confirmation/);
  const tx = renameDefinition(
    repair,
    "confirmations",
    "booking",
    "constructor",
  );
  expect(() =>
    validateSettingsChanges(
      repair,
      applyTransaction(repair, tx).source,
      tx.operations,
    ),
  ).not.toThrow();
});

it("counts readback limits in Unicode characters like the backend", () => {
  const w = parse(repair);
  delete w.nodes.confirm.confirmation;
  w.nodes.confirm.readback = "😀".repeat(4000);
  expect(() => validateStep(w, "confirm")).not.toThrow();
  w.nodes.confirm.readback += "😀";
  expect(() => validateStep(w, "confirm")).toThrow(/4,000/);
});

it("handles omitted request fields while describing and rendering field uses", async () => {
  const { readWorkflow } = await import("../workflow");
  const { definitionUses } = await import("./settings-edits");
  const source =
    "version: 1\nid: empty\nname: Empty\nstart: end\nshared_prompt: Help.\nfields: {name: {type: string}}\nrequests: {empty: {}}\nnodes: {end: {kind: end}}\n";
  expect(definitionUses(readWorkflow(source)!, "fields", "name")).toEqual([]);
  const { renderToString } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { CollectedDataPage } = await import("./CollectedDataPage");
  expect(() =>
    renderToString(
      createElement(CollectedDataPage, {
        workflow: readWorkflow(source)!,
        document: createDocument(
          "empty.yaml",
          new TextEncoder().encode(source),
        ),
        onTransaction: () => {},
        onStep: () => {},
      }),
    ),
  ).not.toThrow();
});
it.each(["customer.name", "customer[0]", "0", "１２"])(
  "rejects field renames that Python format would interpret rather than look up literally: %s",
  (id) => {
    expect(() =>
      renameDefinition(repair, "fields", "customer_name", id),
    ).toThrow(/plain|placeholder|readback/i);
  },
);
