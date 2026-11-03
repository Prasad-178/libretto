import { expect, it } from "vitest";
import minimal from "../../../examples/minimal.yaml?raw";
import { readWorkflow } from "../workflow";
import { applyTransaction } from "./yaml-edits";
import {
  setCollectionUsage,
  removeCollection,
  effectiveSources,
} from "./source-usage";
const attached = () =>
  applyTransaction(minimal, {
    label: "Attach",
    operations: [
      {
        op: "set",
        path: ["knowledge"],
        value: { company: "knowledge/company" },
      },
      { op: "set", path: ["common_knowledge"], value: ["company"] },
      {
        op: "set",
        path: ["nodes", "question", "knowledge"],
        value: ["company"],
      },
    ],
  }).source;
it("moves usage atomically between all steps and a selected subset", () => {
  const next = setCollectionUsage(attached(), "company", {
    kind: "steps",
    stepIds: ["question"],
  });
  const w = readWorkflow(next)!;
  expect(w.common_knowledge).toEqual([]);
  expect(w.nodes.question.knowledge).toEqual(["company"]);
  expect(effectiveSources(w, "question")).toEqual(["company"]);
  expect(effectiveSources(w, "end")).toEqual([]);
  const all = readWorkflow(
    setCollectionUsage(next, "company", { kind: "all" }),
  )!;
  expect(all.common_knowledge).toEqual(["company"]);
  expect(all.nodes.question.knowledge).toEqual([]);
});
it("detaches every reference together while preserving untouched prompt values", () => {
  const source = attached(),
    w = readWorkflow(removeCollection(source, "company"))!;
  expect(w.knowledge?.company).toBeUndefined();
  expect(w.common_knowledge).not.toContain("company");
  expect(
    Object.values(w.nodes).every((n) => !n.knowledge?.includes("company")),
  ).toBe(true);
  expect(w.nodes.question.prompt).toBe(
    readWorkflow(source)!.nodes.question.prompt,
  );
  expect(() =>
    setCollectionUsage(source, "company", {
      kind: "steps",
      stepIds: ["missing"],
    }),
  ).toThrow(/step/i);
});
