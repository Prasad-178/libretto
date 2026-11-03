import { expect, it } from "vitest";
import minimal from "../../../examples/minimal.yaml?raw";
import { readWorkflow } from "../workflow";
import { applyTransaction } from "./yaml-edits";
import {
  insertConfiguredStep,
  createRoute,
  reconnectRoute,
} from "./editor-commands";
const ref = { source: "question", edgeId: "answered" };
it("atomically inserts a conversation with an executable continuation and preserves the selected rule", () => {
  const before = readWorkflow(minimal)!;
  const result = insertConfiguredStep(minimal, ref, {
    kind: "conversation",
    title: "Clarify",
    prompt: "Ask what is unclear.\nWait for a response.",
    continuation: { condition: "The caller clarified their answer." },
  });
  const workflow = readWorkflow(result.source)!;
  expect(workflow.nodes[result.nodeId].edges).toEqual([
    {
      id: "continue",
      to: "end",
      condition: "The caller clarified their answer.",
    },
  ]);
  expect(workflow.nodes[result.nodeId].prompt).toBe(
    "Ask what is unclear.\nWait for a response.",
  );
  expect(workflow.nodes.question.edges[0]).toEqual({
    ...before.nodes.question.edges[0],
    to: result.nodeId,
  });
  expect(() =>
    insertConfiguredStep(minimal, ref, {
      kind: "conversation",
      title: "Empty",
      prompt: "Ask",
      continuation: { condition: "" },
    }),
  ).toThrow(/continuation/i);
});
it("uses declared result/argument mappings without copying another action", () => {
  const source = applyTransaction(minimal, {
    label: "Register tool",
    operations: [{ op: "set", path: ["tools"], value: ["save_answer"] }],
  }).source;
  const tool = {
    name: "save_answer",
    parameters: [{ name: "answer", type: "string" as const, required: true }],
    results: ["saved", "failed"],
  };
  const spec = {
    kind: "action" as const,
    title: "Save",
    tool,
    arguments: { answer: "answer" },
    requires: ["answer"],
    resultDestinations: { saved: "end", failed: "question" },
  };
  const result = insertConfiguredStep(source, ref, spec),
    node = readWorkflow(result.source)!.nodes[result.nodeId];
  expect(node.arguments).toEqual({ answer: "answer" });
  expect(node.requires).toEqual(["answer"]);
  expect(node.edges.map((e) => [e.result, e.to])).toEqual([
    ["saved", "end"],
    ["failed", "question"],
  ]);
  expect(() =>
    insertConfiguredStep(source, ref, {
      ...spec,
      resultDestinations: { saved: "end" },
    }),
  ).toThrow(/failed/);
  expect(() =>
    insertConfiguredStep(source, ref, {
      ...spec,
      arguments: { answer: "missing" },
    }),
  ).toThrow(/field/i);
  expect(() => insertConfiguredStep(minimal, ref, spec)).toThrow(/registered/i);
});
it("keeps state guards and timing; refuses protected insertion and terminal orphaning", () => {
  const source = applyTransaction(minimal, {
    label: "Guard",
    operations: [
      {
        op: "set",
        path: ["nodes", "question", "edges", 0, "predicate"],
        value: { op: "exists", field: "answer" },
      },
      {
        op: "set",
        path: ["nodes", "question", "edges", 0, "timing"],
        value: "before_action",
      },
    ],
  }).source;
  expect(() =>
    insertConfiguredStep(source, ref, {
      kind: "say",
      title: "Say",
      text: "Thanks.",
    }),
  ).toThrow(/protect/i);
  const reconnected = reconnectRoute(source, ref, "question");
  expect(readWorkflow(reconnected)!.nodes.question.edges[0]).toEqual({
    ...readWorkflow(source)!.nodes.question.edges[0],
    to: "question",
  });
  expect(() => reconnectRoute(minimal, ref, "missing")).toThrow(/destination/i);
  const next = createRoute(minimal, "question", {
    id: "retry",
    to: "question",
    condition: "The caller wants to try again.",
  });
  expect(readWorkflow(next)!.nodes.question.edges).toHaveLength(2);
  expect(() =>
    createRoute(next, "question", {
      id: "retry",
      to: "end",
      condition: "Again",
    }),
  ).toThrow(/already/i);
  expect(() =>
    createRoute(minimal, "end", {
      id: "next",
      to: "question",
      condition: "Again",
    }),
  ).toThrow(/End/);
});
it("Say continues automatically and new IDs never collide", () => {
  const first = insertConfiguredStep(minimal, ref, {
    kind: "say",
    title: "Acknowledge",
    text: "Thanks.",
  });
  const second = insertConfiguredStep(first.source, ref, {
    kind: "say",
    title: "Acknowledge",
    text: "One moment.",
  });
  expect(second.nodeId).not.toBe(first.nodeId);
  expect(readWorkflow(first.source)!.nodes[first.nodeId].edges).toEqual([
    { id: "spoken", to: "end" },
  ]);
});

it("requires mapped facts before executing an action", () => {
  const source = applyTransaction(minimal, {
    label: "Register",
    operations: [{ op: "set", path: ["tools"], value: ["save"] }],
  }).source;
  expect(() =>
    insertConfiguredStep(source, ref, {
      kind: "action",
      title: "Save",
      tool: {
        name: "save",
        parameters: [{ name: "answer", type: "string", required: true }],
        results: ["saved"],
      },
      arguments: { answer: "answer" },
      requires: [],
      resultDestinations: { saved: "end" },
    }),
  ).toThrow(/required fact/i);
});
