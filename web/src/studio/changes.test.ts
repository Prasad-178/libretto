import { expect, it } from "vitest";
import minimal from "../../../examples/minimal.yaml?raw";
import { describeChanges, locateIssues, parseIssues } from "./changes";
import { applyTransaction } from "./yaml-edits";
it("lists semantic changes in source order and preserves multiline values", () => {
  const source = applyTransaction(minimal, {
    label: "Edit",
    operations: [
      {
        op: "set",
        path: ["nodes", "question", "prompt"],
        value: "First\nSecond\n",
      },
      { op: "set", path: ["name"], value: "Updated survey" },
    ],
  }).source;
  const changes = describeChanges(minimal, source);
  expect(changes.map((c) => c.path)).toEqual([
    ["name"],
    ["nodes", "question", "prompt"],
  ]);
  expect(changes[1].after).toBe("First\nSecond\n");
  expect(changes[0].from).toBeLessThan(changes[1].from);
  expect(
    describeChanges(minimal, minimal + "# metadata is separate\n"),
  ).toEqual([]);
});
it("keeps invalid raw drafts reviewable and maps structured problems to code ranges", () => {
  const source = "name: [unterminated\n";
  expect(parseIssues(source)[0]).toMatchObject({ severity: "error", path: [] });
  expect(describeChanges(minimal, source)).toEqual([
    expect.objectContaining({
      label: "Raw YAML draft",
      before: minimal,
      after: source,
    }),
  ]);
  const issues = locateIssues(minimal, [
    {
      path: ["nodes", "question", "prompt"],
      message: "Problem",
      severity: "error",
    },
    {
      path: ["no", "matching", "path"],
      message: "Unmapped raw error",
      severity: "error",
    },
  ]);
  expect(minimal.slice(issues[0].from, issues[0].to)).toContain("Ask what");
  expect(issues[1].message).toBe("Unmapped raw error");
});

it("deduplicates the same syntax problem reported locally and by validation", () => {
  const source = "name: [unfinished\n",
    issues = parseIssues(source);
  expect(locateIssues(source, [...issues, ...issues])).toHaveLength(
    issues.length,
  );
});
