import { describe, expect, it } from "vitest";
import * as graph from "./graph";
import { readWorkflow } from "./workflow";
import receptionistSource from "../../examples/receptionist.yaml?raw";

const flow = readWorkflow(`name: Demo
start: greet
shared_prompt: Hello
nodes:
  greet:
    kind: conversation
    title: Greeting
    prompt: Ask how to help.
    edges:
      - {id: connect, to: transfer, condition: The caller wants a person.}
      - {id: finish, to: end, predicate: {op: equals, field: done, value: true}}
  transfer:
    kind: action
    tool: transfer_call
    edges:
      - {id: unavailable, to: greet, result: unavailable}
      - {id: failed, to: greet, result: failed}
      - {id: connected, to: end, result: connected}
  end: {kind: end}
`)!;

describe("YAML graph visualization", () => {
  it("maps every branch, parallel outcome and loop without changing YAML", () => {
    const before = JSON.stringify(flow);
    const result = graph.buildGraph(flow);
    expect(result.nodes.map((n) => n.id)).toContain("greet");
    expect(result.nodes).toHaveLength(4); // Three actual stages and synthetic Start.
    expect(result.edges).toHaveLength(6);
    expect(new Set(result.edges.map((e) => e.id)).size).toBe(6);
    expect(
      result.edges.filter(
        (e) => e.source === "transfer" && e.target === "greet",
      ),
    ).toHaveLength(2);
    expect(result.edges.find((e) => e.id.includes("finish"))?.data?.label).toBe(
      "done = true",
    );
    expect(JSON.stringify(flow)).toBe(before);
    for (const node of result.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
    for (const edge of result.edges) {
      expect(edge.data?.points.length).toBeGreaterThan(1);
    }
  });
  it("rejects incomplete references and bounds graph size", () => {
    expect(() => graph.buildGraph({ ...flow, start: "missing" })).toThrow(
      /start/i,
    );
    const broken = structuredClone(flow);
    broken.nodes.greet.edges[0].to = "missing";
    expect(() => graph.buildGraph(broken)).toThrow(/destination/i);
    expect(() =>
      graph.buildGraph({
        ...flow,
        nodes: Object.fromEntries(
          Array.from({ length: 65 }, (_, i) => [`n${i}`, { kind: "end" }]),
        ),
      } as any),
    ).toThrow(/64/);
  });
  it("formats nested predicates and self loops without losing the condition", () => {
    expect(
      graph.predicateLabel({
        op: "all",
        conditions: [
          { op: "exists", field: "name" },
          { op: "equals", field: "consent", value: false },
        ],
      }),
    ).toBe("name is set AND consent = false");
    const looping = structuredClone(flow);
    looping.nodes.greet.edges.push({
      id: "retry",
      to: "greet",
      condition: "Please repeat",
    });
    expect(
      graph.buildGraph(looping).edges.find((e) => e.source === e.target)?.data
        ?.label,
    ).toBe("Please repeat");
  });
});

it("lays out the bundled receptionist without overlapping stage cards", () => {
  const workflow = readWorkflow(receptionistSource)!;
  const result = graph.buildGraph(workflow);
  expect(result.nodes.length).toBe(Object.keys(workflow.nodes).length + 1);
  expect(result.edges.length).toBe(
    Object.values(workflow.nodes).reduce(
      (count, node) => count + (node.edges?.length || 0),
      1,
    ),
  );
  for (const [i, node] of result.nodes.entries()) {
    for (const other of result.nodes.slice(i + 1)) {
      const overlapX =
        Math.min(
          node.position.x + node.width!,
          other.position.x + other.width!,
        ) - Math.max(node.position.x, other.position.x);
      const overlapY =
        Math.min(
          node.position.y + node.height!,
          other.position.y + other.height!,
        ) - Math.max(node.position.y, other.position.y);
      expect(overlapX > 0 && overlapY > 0).toBe(false);
    }
  }
});

it("preserves logical grouping and every condition on a transition", () => {
  expect(
    graph.predicateLabel({
      op: "all",
      conditions: [
        {
          op: "any",
          conditions: [
            { op: "exists", field: "name" },
            { op: "exists", field: "email" },
          ],
        },
        { op: "equals", field: "consent", value: true },
      ],
    }),
  ).toBe("(name is set OR email is set) AND consent = true");
  expect(
    graph.branchLabel({
      id: "guard",
      to: "end",
      condition: "Caller approves",
      predicate: { op: "equals", field: "approved", value: true },
      result: "captured",
    }),
  ).toBe("approved = true · Result: captured · Caller approves");
});
