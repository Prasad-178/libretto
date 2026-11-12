import { expect, it } from "vitest";
import { readWorkflow } from "../workflow";
import { applyTransaction } from "./yaml-edits";
import {
  emptyMetadata,
  createDocument,
  documentReducer,
} from "./document-store";
import { configureAction, renameRoute, moveRoute } from "./authoring-commands";
const source = `version: 1
id: generic
name: Generic workflow
start: act
shared_prompt: >-
  Keep this prompt
  exactly formatted.
fields:
  answer: {description: Caller answer}
tools: [save_answer]
nodes:
  act:
    kind: action
    tool: save_answer
    requires: [answer]
    arguments: {answer: answer} # keep mapping
    edges:
      # outcome routes
      - id: recovered # keep first
        result: unknown
        to: end
        label: Check receipt
      # normal result
      - {id: saved, result: saved, to: end} # keep flow
      - id: failed
        result: failed
        to: end
  end: {kind: end}
  retry: {kind: end}
`;
const tool = {
  name: "save_answer",
  parameters: [{ name: "answer", type: "string" as const, required: true }],
  results: ["saved", "failed", "unknown"],
};
it("configures outcomes in place, preserving source order, route IDs and untouched comments", () => {
  const tx = configureAction(
    source,
    "act",
    tool,
    { answer: "answer" },
    ["answer"],
    { saved: "retry", failed: "end", unknown: "end" },
  );
  const next = applyTransaction(source, tx).source;
  expect(next).toBe(
    source.replace(
      "{id: saved, result: saved, to: end}",
      "{id: saved, result: saved, to: retry}",
    ),
  );
  expect(readWorkflow(next)!.nodes.act.edges.map((e) => e.id)).toEqual([
    "recovered",
    "saved",
    "failed",
  ]);
});
it("route identity updates named views atomically and undo restores both", () => {
  const doc = createDocument("generic.yaml", new TextEncoder().encode(source));
  doc.metadata = {
    ...emptyMetadata(),
    views: [
      {
        id: "one",
        name: "Focused",
        visibleRoutes: [{ source: "act", edgeId: "saved" }],
      },
    ],
  };
  const tx = renameRoute(
    source,
    { source: "act", edgeId: "saved" },
    "constructor",
    doc.metadata,
  );
  const next = documentReducer(doc, { type: "transaction", transaction: tx });
  expect(readWorkflow(next.source)!.nodes.act.edges[1].id).toBe("constructor");
  expect(next.metadata.views[0].visibleRoutes[0].edgeId).toBe("constructor");
  expect(documentReducer(next, { type: "undo" }).source).toBe(source);
  expect(documentReducer(next, { type: "undo" }).metadata).toEqual(
    doc.metadata,
  );
  expect(() =>
    renameRoute(
      source,
      { source: "act", edgeId: "saved" },
      "failed",
      doc.metadata,
    ),
  ).toThrow(/already/);
});
it.each(["\n", "\r\n"])(
  "moves whole route source blocks with comments and flow styles using %j",
  (newline) => {
    const input = source.replaceAll("\n", newline);
    const next = applyTransaction(
      input,
      moveRoute(input, { source: "act", edgeId: "saved" }, -1),
    ).source;
    const before = `      - id: recovered # keep first\n        result: unknown\n        to: end\n        label: Check receipt\n      # normal result\n      - {id: saved, result: saved, to: end} # keep flow\n`;
    const after = `      # normal result\n      - {id: saved, result: saved, to: end} # keep flow\n      - id: recovered # keep first\n        result: unknown\n        to: end\n        label: Check receipt\n`;
    expect(next).toBe(
      input.replace(
        before.replaceAll("\n", newline),
        after.replaceAll("\n", newline),
      ),
    );
    expect(readWorkflow(next)!.nodes.act.edges.map((e) => e.result)).toEqual([
      "saved",
      "unknown",
      "failed",
    ]);
  },
);
it("refuses duplicate result bindings and tool contracts without required recovery", () => {
  const duplicate = source.replace("result: failed", "result: saved");
  expect(() =>
    configureAction(duplicate, "act", tool, { answer: "answer" }, ["answer"], {
      saved: "end",
      failed: "end",
      unknown: "end",
    }),
  ).toThrow(/duplicate/i);
  expect(() =>
    configureAction(
      source,
      "act",
      { ...tool, results: ["saved"] },
      { answer: "answer" },
      ["answer"],
      { saved: "end" },
    ),
  ).toThrow(/failed.*unknown|recovery/);
});

it('reorders flow sequences and final unterminated blocks without changing surrounding prompts',()=>{
 const flow=source.replace(/    edges:[\s\S]*?  end:/,'    edges: [{id: one, result: saved, to: end}, {id: two, result: failed, to: end}, {id: three, result: unknown, to: end}] # routes\n  end:');
 const next=applyTransaction(flow,moveRoute(flow,{source:'act',edgeId:'three'},-1)).source;
 expect(readWorkflow(next)!.nodes.act.edges.map(e=>e.id)).toEqual(['one','three','two']);
 expect(next).toContain('# routes');
 expect(next.slice(0,next.indexOf('    edges:'))).toBe(flow.slice(0,flow.indexOf('    edges:')));
 const blocks='items:\n  - first\n  - second';
 const moved=applyTransaction(blocks,{label:'Move',operations:[{op:'move',path:['items'],from:1,to:0}]}).source;
 expect(moved).toBe('items:\n  - second\n  - first');
});
