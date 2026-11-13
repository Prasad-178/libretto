import { describe, expect, it } from "vitest";
import { parseEvidence, replayState } from "./saved-evidence";

function bundle() {
  return {
    format: "libretto.scenario-evidence",
    version: 1,
    runs: [
      {
        name: "Repair",
        passed: true,
        failures: [],
        stages: ["collect", "confirm"],
        facts: { address: "[redacted]" },
        actions: [],
        codes: [],
        completed: false,
        passages: [],
        context: {
          workflow_sha256: "a".repeat(64),
          workflow_id: "repair",
          start_stage: "collect",
          yaml_schema_version: 1,
          libretto_version: "0.1.0",
          libretto_commit: null,
          source_dirty: null,
          mode: "scripted",
          models: {},
          speech: {},
          redacted_fields: ["address"],
        },
        timeline: [
          {
            sequence: 1,
            type: "state",
            epoch: 1,
            details: {
              active_stage: "collect",
              facts: { address: "[redacted]" },
            },
          },
          {
            sequence: 2,
            type: "transition",
            epoch: 1,
            details: {
              source: "collect",
              destination: "confirm",
              edge: "ready",
            },
          },
        ],
      },
    ],
  };
}

describe("saved scenario evidence", () => {
  it("validates projected evidence and derives replay state without an execution client", () => {
    const run = parseEvidence(JSON.stringify(bundle())).runs[0];
    expect(replayState(run, 0)).toEqual({
      stage: "collect",
      facts: { address: "[redacted]" },
    });
    expect(replayState(run, 1)).toEqual({
      stage: "confirm",
      facts: { address: "[redacted]" },
    });
  });
  it.each([
    (data: any) => {
      data.version = 999;
    },
    (data: any) => {
      data.runs[0].context.mode = "live";
    },
    (data: any) => {
      data.runs[0].context.workflow_sha256 = "bad";
    },
    (data: any) => {
      data.runs[0].timeline[0].sequence = 42;
    },
    (data: any) => {
      data.runs[0].timeline[0].details.facts = [];
    },
    (data: any) => {
      data.runs[0].passed = "true";
    },
    (data: any) => {
      data.runs = [];
    },
    (data: any) => {
      data.runs[0].actions = [{ tool: "book" }];
    },
  ])("rejects unsupported or malformed files before rendering", (change) => {
    const data = bundle();
    change(data);
    expect(() => parseEvidence(JSON.stringify(data))).toThrow();
  });
  it("rejects excessive size, depth and event counts", () => {
    expect(() => parseEvidence(" ".repeat(5_000_001))).toThrow();
    expect(() =>
      parseEvidence("[".repeat(30) + "0" + "]".repeat(30)),
    ).toThrow();
    const data = bundle();
    data.runs[0].timeline = Array(5001).fill(data.runs[0].timeline[0]);
    expect(() => parseEvidence(JSON.stringify(data))).toThrow();
  });
  it("keeps unusual fact IDs as inert data", () => {
    const data = bundle();
    data.runs[0].timeline[0].details.facts = JSON.parse(
      '{"__proto__":"[redacted]"}',
    );
    const state = replayState(parseEvidence(JSON.stringify(data)).runs[0], 0);
    expect(Object.hasOwn(state.facts, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});
it("accepts structured missing-field diagnostics without dropping their route reference", () => {
  const data = bundle();
  data.runs[0].timeline = [
    {
      sequence: 1,
      type: "action_blocked",
      epoch: 1,
      details: {
        node: "confirm",
        source: "collect",
        edge: "ready",
        policy: "booking",
        code: "missing_facts",
        reason: "Collect details.",
        missing_fields: ["address"],
      },
    } as any,
  ];
  const parsed = parseEvidence(JSON.stringify(data));
  expect(parsed.runs[0].timeline[0].details.missing_fields).toEqual([
    "address",
  ]);
});
