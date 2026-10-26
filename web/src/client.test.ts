import { describe, expect, it } from "vitest";
import { EpochGate, safeExport } from "./client";
describe("session protocol", () => {
  it("rejects output from an interrupted epoch without rolling back current state", () => {
    const gate = new EpochGate();
    expect(gate.accept(2)).toBe(true);
    expect(gate.accept(4)).toBe(true);
    expect(gate.accept(2)).toBe(false);
    expect(gate.current).toBe(4);
  });
  it("does not export provider keys nested in debug data", () => {
    const source = {
      type: "debug",
      data: {
        openrouter_key: "private",
        nested: { Authorization: "Bearer private" },
        text: "Hello",
      },
    };
    const exported = JSON.stringify(safeExport(source));
    expect(exported).not.toContain("private");
    expect(exported).toContain("Hello");
    expect(source.data.openrouter_key).toBe("private");
  });
});
