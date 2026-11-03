import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import minimal from "../../../examples/minimal.yaml?raw";
import { applyTransaction } from "./yaml-edits";
const set = (source: string, path: (string | number)[], value: unknown) =>
  applyTransaction(source, {
    label: "Edit",
    operations: [{ op: "set", path, value }],
  }).source;
describe("localized YAML transactions", () => {
  it.each(["\n", "\r\n"])(
    "preserves every untouched byte with %j newlines",
    (newline) => {
      const source =
        "\uFEFF# keep this" + newline + minimal.replaceAll("\n", newline);
      expect(
        applyTransaction(source, { label: "No edit", operations: [] }).source,
      ).toBe(source);
      const result = applyTransaction(source, {
        label: "Rename",
        operations: [{ op: "set", path: ["name"], value: "Survey v2" }],
      });
      const [patch] = result.patches;
      expect(result.source).toBe(
        source.slice(0, patch.from) + patch.insert + source.slice(patch.to),
      );
      expect(result.source.startsWith("\uFEFF# keep this" + newline)).toBe(
        true,
      );
      expect(
        parseDocument(result.source).getIn(["nodes", "question", "prompt"]),
      ).toBe(parseDocument(source).getIn(["nodes", "question", "prompt"]));
      expect(source.slice(patch.from, patch.to)).toBe(
        parseDocument(source).get("name"),
      );
    },
  );
  it.each(["|-", "|", "|+", ">-", ">", ">+"])(
    "retains block style %s and exact prompt value",
    (style) => {
      const source = `# first\nname: Demo\nprompt: ${style} # prompt note\n  First line\n  second line\n\nnext: 'keep me' # tail\n`;
      const prompt = "New line — café 東京\n\nSecond paragraph.\n";
      const result = set(source, ["prompt"], prompt);
      expect(parseDocument(result).get("prompt")).toBe(prompt);
      expect(result).toContain(style[0]);
      expect(result).toContain("# prompt note");
      expect(result.endsWith("next: 'keep me' # tail\n")).toBe(true);
    },
  );
  it.each(["", "\n"])(
    "preserves final newline %j, quotes and comments through structural edits",
    (final) => {
      const source = `name: 'Original' # name\nnodes:\n  ask:\n    prompt: >-\n      One line\n      continues.\n    edges: [{id: next, to: end}] # route\n  end: {kind: end}${final}`;
      const before = parseDocument(source).toJS();
      const added = set(source, ["nodes", "ask", "title"], "Caller’s question");
      expect(parseDocument(added).getIn(["nodes", "ask", "prompt"])).toBe(
        before.nodes.ask.prompt,
      );
      expect(added).toContain("# route");
      expect(added.startsWith("name: 'Original' # name\n")).toBe(true);
      expect(added.endsWith(`  end: {kind: end}${final}`)).toBe(true);
      const removed = applyTransaction(added, {
        label: "Delete",
        operations: [{ op: "delete", path: ["nodes", "ask", "title"] }],
      }).source;
      expect(
        parseDocument(removed).getIn(["nodes", "ask", "title"]),
      ).toBeUndefined();
    },
  );
  it("composes independent and overlapping edits into original-source patches", () => {
    const source = "a: one\nobject: {x: old, y: keep}\nz: last\n";
    const result = applyTransaction(source, {
      label: "Atomic",
      operations: [
        { op: "set", path: ["a"], value: "new" },
        { op: "set", path: ["object", "added"], value: true },
        { op: "set", path: ["object", "x"], value: "revised" },
      ],
    });
    let replay = source;
    for (const p of [...result.patches].sort((a, b) => b.from - a.from))
      replay = replay.slice(0, p.from) + p.insert + replay.slice(p.to);
    expect(replay).toBe(result.source);
    expect(parseDocument(replay).toJS()).toEqual({
      a: "new",
      object: { x: "revised", y: "keep", added: true },
      z: "last",
    });
  });
  it("does not normalize no-op sets and rejects ambiguous constructs with a raw-edit remedy", () => {
    const source = "name: 'same' # note\n";
    expect(set(source, ["name"], "same")).toBe(source);
    for (const bad of [
      "a: &x value\nb: *x\n",
      "a: first\na: second\n",
      "a: [unfinished",
    ]) {
      expect(() => set(bad, ["a"], "new")).toThrow(/YAML|raw/i);
    }
  });
});

it("does not duplicate a header comment when adding a root property", () => {
  const source =
    "\uFEFF# exactly once\r\nname: 'Demo' # retained\r\nprompt: |-\r\n  one\r\n  two\r\n";
  const next = set(source, ["models"], { speaker: "model/example" });
  expect(next.match(/# exactly once/g)).toHaveLength(1);
  expect(next.startsWith("\uFEFF# exactly once\r\n")).toBe(true);
  expect(parseDocument(next).get("prompt")).toBe("one\ntwo");
});

it("structural additions preserve existing comments and folded prompt bytes", () => {
  const source =
    "name: Demo\nshared_prompt: >-\n  first line\n  second line\nnodes:\n  ask:\n    kind: conversation\n    edges: # exits comment\n      # route comment\n      - id: done # id comment\n        to: end\n  end: {kind: end}\n";
  const added = set(source, ["welcome"], "Hello");
  expect(added).toContain(source);
  const edges = parseDocument(source).toJS().nodes.ask.edges;
  const routed = set(
    source,
    ["nodes", "ask", "edges"],
    [...edges, { id: "retry", to: "ask", condition: "Again" }],
  );
  expect(routed).toContain(
    "edges: # exits comment\n      # route comment\n      - id: done # id comment\n        to: end\n",
  );
  expect(routed).toContain("shared_prompt: >-\n  first line\n  second line\n");
});
it.each(["Yes", "No", "on", "OFF"])(
  "quotes YAML 1.1 ambiguous string %s",
  (value) => {
    const next = set("prompt: hello\n", ["prompt"], value);
    expect(parseDocument(next, { version: "1.1" }).get("prompt")).toBe(value);
  },
);
