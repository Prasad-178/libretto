import { expect, it } from "vitest";
import source from "../../examples/receptionist.yaml?raw";
import { readWorkflow } from "./workflow";
import { editEdge, editValue } from "./studio-editing";

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

  expect(() =>
    editEdge(source, { source: from, edgeId: "missing" }, "to", "end"),
  ).toThrow();
});

it("preserves the original source around a localized prompt edit", () => {
  const original = "\uFEFF# retained\r\n" + source.replaceAll("\n", "\r\n");
  const workflow = readWorkflow(original)!;
  const id = Object.keys(workflow.nodes)[0];
  const next = editValue(
    original,
    ["nodes", id, "prompt"],
    "Ask clearly.\nWait for the caller.",
  );
  expect(next.startsWith("\uFEFF# retained\r\n")).toBe(true);
  expect(readWorkflow(next)!.nodes[id].prompt).toBe(
    "Ask clearly.\nWait for the caller.",
  );
  expect(next.slice(next.indexOf("  transfer:"))).toBe(
    original.slice(original.indexOf("  transfer:")),
  );
});
