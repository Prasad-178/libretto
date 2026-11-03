import { describe, expect, it } from "vitest";
import { readWorkflow } from "../workflow";
import { routeKey, routeKind, routeLabel } from "./workflow-model";
import { buildGraph } from "../graph";
const fixtures = import.meta.glob("./fixtures/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
describe("workflow identities", () => {
  it("keeps source-local IDs and punctuation distinct", () => {
    const refs = [{source:"a", edgeId:"failed"}, {source:"b", edgeId:"failed"}, {source:"a:b", edgeId:"c"}, {source:"a", edgeId:"b:c"}];
    expect(new Set(refs.map(routeKey)).size).toBe(refs.length);
    expect(routeKey(refs[0])).toBe('["a","failed"]');
  });
  it("shares presentation labels independently of execution rules", () => {
    expect(routeLabel({id:"details_complete",to:"next"})).toBe("Details complete");
    expect(routeLabel({id:"x",to:"next",label:"Ready to continue"})).toBe("Ready to continue");
    const mixed={id:"next",to:"end",condition:"Caller agrees",predicate:{op:"exists",field:"answer"}};
    expect(routeKind({kind:"conversation"}, mixed)).toBe("legacy-mixed");
    expect(routeKind({kind:"conversation"}, {id:"next",to:"end"})).toBe("unconfigured");
    expect(routeKind({kind:"say"}, {id:"next",to:"end"})).toBe("automatic");
    expect(routeKind({kind:"action"}, {id:"next",to:"end",result:"failed"})).toBe("result");
  });
  it.each(Object.entries(fixtures))("loads the complete generic fixture %s and conserves routes", (_name, source) => {
    const workflow=readWorkflow(source)!;
    expect(workflow).not.toBeNull();
    const routes=Object.entries(workflow.nodes).flatMap(([source,node])=>(node.edges||[]).map(edge=>routeKey({source,edgeId:edge.id})));
    expect(new Set(routes).size).toBe(routes.length);
    expect(buildGraph(workflow).edges.length).toBe(routes.length+1);
  });
  it("rejects graphs just over either display bound", () => {
    const workflow=readWorkflow(fixtures["./fixtures/boundary.yaml"])!;
    expect(Object.keys(workflow.nodes)).toHaveLength(64);
    expect(buildGraph(workflow).edges).toHaveLength(257);
    workflow.nodes.node_0.edges.push({id:"overflow",to:"node_1",condition:"Extra"});
    expect(()=>buildGraph(workflow)).toThrow(/256/);
    workflow.nodes.extra={kind:"end"} as any;
    expect(()=>buildGraph(workflow)).toThrow(/64/);
  });
});
