import { expect, it } from "vitest";
import { readWorkflow } from "../workflow";
import minimal from "../../../examples/minimal.yaml?raw";
import { emptyMetadata } from "./document-store";
import { readStudioMetadata } from "./studio-metadata";
it("drops stale references with notices and excludes transient/device fields", () => {
  const workflow = readWorkflow(minimal)!;
  const data = {
    ...emptyMetadata(),
    positions: { question: { x: 10, y: 20 }, missing: { x: 1, y: 2 } },
    sourceNames: { missing: "Missing" },
    groups: [{ id: "g", label: "Group", members: ["question", "missing"] }],
    views: [
      {
        id: "v",
        name: "Overview",
        visibleRoutes: [
          { source: "question", edgeId: "answered" },
          { source: "missing", edgeId: "answered" },
        ],
      },
    ],
    endpoint: "https://secret",
    credentials: { key: "secret" },
    panelWidth: 400,
  };
  const result = readStudioMetadata(JSON.stringify(data), workflow);
  expect(result.metadata.positions).toEqual({ question: { x: 10, y: 20 } });
  expect(result.metadata.views[0].visibleRoutes).toEqual([
    { source: "question", edgeId: "answered" },
  ]);
  expect(result.metadata.groups[0].members).toEqual(["question"]);
  expect(result.notices.length).toBeGreaterThan(0);
  expect(JSON.stringify(result.metadata)).not.toMatch(/secret|panelWidth/);
});
it("uses structured route IDs without delimiter collisions and rejects malformed coordinates", () => {
  const workflow = readWorkflow(minimal)!;
  workflow.nodes["a:b"] = {
    ...workflow.nodes.question,
    edges: [{ id: "c", to: "end" }],
  };
  workflow.nodes.a = {
    ...workflow.nodes.question,
    edges: [{ id: "b:c", to: "end" }],
  };
  const view = {
    id: "all",
    name: "All",
    visibleRoutes: [
      { source: "a:b", edgeId: "c" },
      { source: "a", edgeId: "b:c" },
    ],
  };
  const result = readStudioMetadata(
    JSON.stringify({
      ...emptyMetadata(),
      views: [view],
      positions: { a: { x: "bad", y: 1 } },
    }),
    workflow,
  );
  expect(result.metadata.views[0]).toEqual(view);
  expect(result.metadata.positions).toEqual({});
  expect(() => readStudioMetadata('{"version":2}', workflow)).toThrow(
    /version/i,
  );
});

it("round trips prototype-like node positions as own properties", () => {
  const workflow = readWorkflow(
    "name: Safe\nshared_prompt: Help\nstart: __proto__\nnodes:\n  __proto__: {kind: end}\n",
  )!;
  const result = readStudioMetadata(
    '{"version":1,"positions":{"__proto__":{"x":10,"y":20}}}',
    workflow,
  );
  expect(Object.hasOwn(result.metadata.positions, "__proto__")).toBe(true);
  expect(
    JSON.parse(JSON.stringify(result.metadata)).positions.__proto__,
  ).toEqual({ x: 10, y: 20 });
});
