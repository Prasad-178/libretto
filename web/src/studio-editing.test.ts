import { expect, it } from "vitest";
import source from "../../examples/receptionist.yaml?raw";
import { readWorkflow } from "./workflow";
import { editEdge, editValue, insertStep } from "./studio-editing";

it("edits a prompt without losing readback, guards, comments, or other steps", () => {
  const original = readWorkflow(source)!;
  const id = Object.keys(original.nodes)[0];
  const result = readWorkflow(
    editValue(source, ["nodes", id, "prompt"], "Ask one question."),
  )!;
  expect(result.nodes[id]).toEqual({
    ...original.nodes[id],
    prompt: "Ask one question.",
  });
  expect(result.nodes).toEqual({ ...original.nodes, [id]: result.nodes[id] });
});
it("inserts into one branch while preserving its conditions and other branches", () => {
  const w = readWorkflow(source)!;
  const from = Object.keys(w.nodes).find((id) =>
    w.nodes[id].edges?.some((e) => e.timing !== "before_action"),
  )!;
  const edge = w.nodes[from].edges.find((e) => e.timing !== "before_action")!;
  const result = insertStep(
    source,
    { source: from, edgeId: edge.id },
    "conversation",
  );
  const next = readWorkflow(result.source)!;
  expect(next.nodes[from].edges).toEqual(
    w.nodes[from].edges.map((e) =>
      e.id === edge.id ? { ...e, to: result.id } : e,
    ),
  );
  expect(next.nodes[result.id].edges).toEqual([
    { id: "continue", to: edge.to },
  ]);
  expect(
    insertStep(result.source, { source: from, edgeId: edge.id }, "say").id,
  ).not.toBe(result.id);
});
it("edits a transition by identity and rejects stale selections and unsafe insertion", () => {
  const w = readWorkflow(source)!;
  const from = Object.keys(w.nodes).find((id) =>
    w.nodes[id].edges?.some((e) => e.timing === "before_action"),
  )!;
  const edge = w.nodes[from].edges.find((e) => e.timing === "before_action")!;
  const sel = { source: from, edgeId: edge.id };
  expect(
    readWorkflow(
      editEdge(source, sel, "condition", "Explicit approval"),
    )!.nodes[from].edges.find((e) => e.id === edge.id)?.predicate,
  ).toEqual(edge.predicate);
  expect(() => insertStep(source, sel, "conversation")).toThrow(
    "protects an action",
  );
  expect(() =>
    editEdge(source, { source: from, edgeId: "missing" }, "to", "end"),
  ).toThrow();
  expect(() => insertStep(source, sel, "end")).toThrow();
});

it("keeps registered action arguments and requirements when inserting an action", () => {
  const w = readWorkflow(source)!;
  const template = Object.values(w.nodes).find((n) => n.kind === "action")!;
  const from = Object.keys(w.nodes).find((id) =>
    w.nodes[id].edges?.some((e) => e.timing !== "before_action"),
  )!;
  const edge = w.nodes[from].edges.find((e) => e.timing !== "before_action")!;
  const result = insertStep(
    source,
    { source: from, edgeId: edge.id },
    "action",
    template.tool!,
  );
  const node = readWorkflow(result.source)!.nodes[result.id];
  expect(node.arguments).toEqual(template.arguments);
  expect(node.requires).toEqual(template.requires);
  expect(() =>
    insertStep(
      source,
      { source: from, edgeId: edge.id },
      "action",
      "not_registered",
    ),
  ).toThrow("registered action");
});
