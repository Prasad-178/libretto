import { describe, it, expect } from "vitest";
import { readWorkflow, setYamlValue } from "./workflow";
const source =
  "# keep this\nversion: 1\nid: test\nname: Test\nstart: hello\nshared_prompt: Be helpful\nnodes:\n  hello:\n    kind: conversation\n    prompt: Hello\n    edges: []\n";

it("rejects malformed task/rule forms but accepts schema-supported nullable bindings", () => {
  expect(readWorkflow(source + "requests: {broken: null}\n")).toBeNull();
  expect(readWorkflow(source + "tools: not-a-list\n")).toBeNull();
  expect(
    readWorkflow(source + "confirmations: {broken: {fields: null}}\n"),
  ).toBeNull();
  expect(
    readWorkflow(
      source.replace(
        "prompt: Hello",
        "prompt: Hello\n    begin_request: null\n    confirmation: null",
      ),
    ),
  ).not.toBeNull();
});
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

it("accepts an explicitly null optional tool as the server schema does", () => {
  expect(
    readWorkflow(
      "name: Demo\nshared_prompt: Hello\nstart: end\nnodes:\n  end: {kind: end, tool: null}\n",
    )?.nodes.end.kind,
  ).toBe("end");
});

it("rejects schema-invalid predicate containers before exposing forms", () => {
  const malformed = source.replace(
    "edges: []",
    "edges: [{id: retry, to: hello, predicate: {op: all, conditions: broken}}]",
  );
  expect(readWorkflow(malformed)).toBeNull();
});
