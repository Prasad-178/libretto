import { expect, it } from "vitest";
import { readWorkflow } from "../workflow";
import source from "../../../examples/receptionist.yaml?raw";
import { fieldReferences } from "./field-references";
it("finds actual predicate, argument, requirement and readback references", () => {
  const w = readWorkflow(source)!;
  expect(fieldReferences(w, "callback_number")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ nodeId: "save_message", kind: "argument" }),
      expect.objectContaining({ nodeId: "save_message", kind: "required" }),
      expect.objectContaining({ nodeId: "take_message", kind: "state check" }),
    ]),
  );
  expect(fieldReferences(w, "missing")).toEqual([]);
});
