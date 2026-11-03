import { describe, expect, it } from "vitest";
import { readWorkflow } from "../workflow";
import { emptyMetadata } from "./document-store";
import { describeRoutes, presentRoutes, analyzeStructure } from "./graph-model";
import { layoutWorkflow } from "./graph-layout";
import { routeKey } from "./workflow-model";
const fixtures = import.meta.glob("./fixtures/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
describe("generic graph model", () => {
  it.each(Object.entries(fixtures))(
    "conserves every route and keeps a stable layout: %s",
    (_name, source) => {
      const workflow = readWorkflow(source)!;
      const routes = describeRoutes(workflow);
      for (const view of [
        null,
        {
          id: "overview",
          name: "Overview",
          visibleRoutes: routes.slice(0, 2).map((r) => r.ref),
        },
      ]) {
        const p = presentRoutes(routes, view);
        const keys = p.flatMap((p) => p.refs.map(routeKey));
        expect(keys.length).toBe(routes.length);
        expect(new Set(keys)).toEqual(
          new Set(routes.map((r) => routeKey(r.ref))),
        );
      }
      const layout = layoutWorkflow(workflow, emptyMetadata());
      expect(layout).toEqual(layoutWorkflow(workflow, emptyMetadata()));
      expect(layout.nodes.map((n) => n.id)).toEqual(
        Object.keys(workflow.nodes),
      );
      for (const [i, node] of layout.nodes.entries())
        for (const other of layout.nodes.slice(i + 1)) {
          expect(
            node.x < other.x + other.width &&
              node.x + node.width > other.x &&
              node.y < other.y + other.height &&
              node.y + node.height > other.y,
          ).toBe(false);
        }
      for (const route of layout.routes)
        expect(
          route.points.every(
            (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
          ),
        ).toBe(true);
    },
  );
  it("detects SCC cycles, unreachable components and distinct real terminals", () => {
    const cyclic = readWorkflow(fixtures["./fixtures/cycle-only.yaml"])!;
    expect(analyzeStructure(cyclic).components).toEqual([["first", "second"]]);
    expect(analyzeStructure(cyclic).returns.map(routeKey)).toContain(
      routeKey({ source: "second", edgeId: "return" }),
    );
    const unreachable = readWorkflow(fixtures["./fixtures/unreachable.yaml"])!;
    expect(layoutWorkflow(unreachable, emptyMetadata()).unreachable).toEqual([
      "orphan",
    ]);
    expect(layoutWorkflow(cyclic, emptyMetadata()).nodes).toHaveLength(2);
  });
  it("keeps unchanged/pinned positions and recomputes route endpoints", () => {
    const workflow = readWorkflow(fixtures["./fixtures/intake.yaml"])!;
    const metadata = emptyMetadata();
    metadata.positions.collect = { x: 123, y: 45 };
    const first = layoutWorkflow(workflow, metadata);
    expect(first.nodes.find((n) => n.id === "collect")).toMatchObject({
      x: 123,
      y: 45,
    });
    const moved = structuredClone(workflow);
    moved.nodes.collect.prompt = "Changed prompt";
    expect(layoutWorkflow(moved, metadata, first).nodes).toEqual(first.nodes);
  });
  it("bundles only parallel results and marks shared destinations structurally", () => {
    const workflow = readWorkflow(
      fixtures["./fixtures/parallel-results.yaml"],
    )!;
    const p = presentRoutes(describeRoutes(workflow), null);
    expect(p.find((p) => p.mode === "bundle")?.refs).toEqual([
      { source: "action", edgeId: "retry" },
      { source: "action", edgeId: "failure" },
    ]);
    const shared = readWorkflow(fixtures["./fixtures/eight-incoming.yaml"])!;
    expect(
      presentRoutes(describeRoutes(shared), null).filter(
        (p) => p.mode === "chip",
      ),
    ).toHaveLength(8);
  });
});

it("routes self-loops around the card with right-angle segments", () => {
  const workflow = readWorkflow(fixtures["./fixtures/self-loop.yaml"])!;
  const loop = layoutWorkflow(workflow, emptyMetadata()).routes.find(
    (r) => r.ref.edgeId === "retry",
  )!;
  expect(loop.points.length).toBeGreaterThanOrEqual(5);
  for (let i = 1; i < loop.points.length; i++)
    expect(
      loop.points[i].x === loop.points[i - 1].x ||
        loop.points[i].y === loop.points[i - 1].y,
    ).toBe(true);
});

it("does not reserve long connector ranks for routes shown as destination chips", async () => {
  const { default: source } =
    await import("../../../examples/receptionist.yaml?raw");
  const layout = layoutWorkflow(readWorkflow(source)!, emptyMetadata());
  expect(layout.bounds.height).toBeLessThan(1500);
});

it("reflows a changed topology instead of attaching new paths to obsolete node positions", async () => {
  const { insertConfiguredStep } = await import("./editor-commands");
  const source = fixtures["./fixtures/intake.yaml"],
    workflow = readWorkflow(source)!;
  const before = layoutWorkflow(workflow, emptyMetadata());
  const inserted = insertConfiguredStep(
    source,
    { source: "collect", edgeId: "details_complete" },
    {
      kind: "conversation",
      title: "Clarify",
      prompt: "Ask for clarification.",
      continuation: { condition: "The caller clarifies." },
    },
  );
  const next = readWorkflow(inserted.source)!;
  expect(layoutWorkflow(next, emptyMetadata(), before)).toEqual(
    layoutWorkflow(next, emptyMetadata()),
  );
});
