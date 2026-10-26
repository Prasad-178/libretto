import { describe, expect, it } from "vitest";
import * as graph from "./graph";
import { readWorkflow } from "./workflow";

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
