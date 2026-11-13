import { expect, it } from "vitest";
import { readWorkflow } from "../workflow";
import { diagnosticTargets } from "./debug-navigation";

const workflow = readWorkflow(`version: 1
id: navigation
name: Navigation
shared_prompt: Help
start: collect
fields: {address: {type: string}, accepted: {type: boolean}}
requests: {visit: {fields: [address, accepted]}}
confirmations: {booking: {request: visit, fields: [address], acceptance_field: accepted}}
nodes:
  collect: {kind: conversation, edges: [{id: attempt, to: confirm, condition: ready}]}
  confirm: {kind: conversation, confirmation: booking, readback: 'At {address}', edges: [{id: done, to: end, condition: approved}]}
  end: {kind: end}
`)!;
it("resolves exact existing connection/rule references instead of guessing from prose", () => {
  expect(
    diagnosticTargets(
      {
        node: "confirm",
        source: "collect",
        edge: "attempt",
        policy: "booking",
      },
      workflow,
    ),
  ).toEqual([
    { kind: "route", source: "collect", edgeId: "attempt" },
    { kind: "policy", node: "confirm", policy: "booking" },
  ]);
});
it("refuses stale, invented and prototype-like references", () => {
  expect(
    diagnosticTargets(
      {
        node: "collect",
        source: "collect",
        edge: "missing",
        policy: "booking",
      },
      workflow,
    ),
  ).toEqual([]);
  expect(
    diagnosticTargets(
      {
        node: "constructor",
        source: "__proto__",
        edge: "attempt",
        policy: "toString",
      },
      workflow,
    ),
  ).toEqual([]);
});
