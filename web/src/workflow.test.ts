import { describe, it, expect } from "vitest";
import { readWorkflow, setYamlValue } from "./workflow";
const source =
  "# keep this\nversion: 1\nid: test\nname: Test\nstart: hello\nshared_prompt: Be helpful\nnodes:\n  hello:\n    kind: conversation\n    prompt: Hello\n    edges: []\n";
describe("YAML configuration edits", () => {
  it("updates the same document and preserves comments", () => {
    const edited = setYamlValue(
      source,
      ["nodes", "hello", "prompt"],
      "Ask one question.",
    );
    expect(edited).toContain("# keep this");
    expect(readWorkflow(edited)?.nodes.hello.prompt).toBe("Ask one question.");
    expect(readWorkflow(edited)?.shared_prompt).toBe("Be helpful");
  });
  it("rejects broken or incomplete YAML previews", () => {
    expect(readWorkflow("nodes: [")).toBeNull();
    expect(readWorkflow("hello: world")).toBeNull();
    expect(() => setYamlValue("nodes: [", ["name"], "x")).toThrow();
  });
});

it("keeps malformed node shapes out of the configuration form", () => {
  expect(
    readWorkflow("name: Test\nshared_prompt: Hello\nnodes:\n  broken: null\n"),
  ).toBeNull();
  expect(
    readWorkflow(
      "name: Test\nshared_prompt: Hello\nnodes:\n  broken:\n    kind: conversation\n    edges: [null]\n",
    ),
  ).toBeNull();
});

it("previews a raw terminal YAML node without normalized optional fields", () => {
  expect(
    readWorkflow(
      "name: Test\nshared_prompt: Hello\nstart: end\nnodes:\n  end: {kind: end}\n",
    )?.nodes.end.kind,
  ).toBe("end");
});

it("rejects malformed display fields instead of crashing a workflow card", () => {
  for (const malformed of [
    "title: {nested: wrong}",
    "prompt: [wrong]",
    "tools: wrong",
    "knowledge: [42]",
  ]) {
    expect(readWorkflow(source + "    " + malformed + "\n")).toBeNull();
  }
});
