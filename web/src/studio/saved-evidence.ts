/** Inert, bounded evidence data. This module has no session or provider imports. */
export type Value = string | boolean | null;
export type EvidenceEvent = {
  sequence: number;
  type: string;
  epoch: number;
  details: Record<string, unknown>;
};
export type EvidenceRun = {
  name: string;
  passed: boolean;
  failures: string[];
  stages: string[];
  facts: Record<string, Value>;
  actions: {
    tool: string;
    arguments: Record<string, Value>;
    status: string;
    argument_fingerprint: string;
    request: string;
  }[];
  codes: string[];
  completed: boolean;
  passages: string[];
  context: {
    workflow_sha256: string;
    workflow_id: string;
    start_stage: string;
    yaml_schema_version: number;
    libretto_version: string | null;
    libretto_commit: string | null;
    source_dirty: boolean | null;
    mode: "scripted";
    models: Record<string, unknown>;
    speech: Record<string, unknown>;
    redacted_fields: string[];
  };
  timeline: EvidenceEvent[];
};
export type EvidenceBundle = {
  format: "libretto.scenario-evidence";
  version: 1;
  runs: EvidenceRun[];
};

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function requireShape(condition: unknown): asserts condition {
  if (!condition)
    throw new Error(
      "Invalid saved evidence. Export a version 1 scenario-evidence file with Libretto.",
    );
}
function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 5000 &&
    value.every((item) => typeof item === "string")
  );
}
function values(value: unknown): value is Record<string, Value> {
  return (
    record(value) &&
    Object.values(value).every(
      (item) =>
        item === null || typeof item === "string" || typeof item === "boolean",
    )
  );
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function bounded(value: unknown, depth = 0): void {
  requireShape(depth <= 20);
  if (Array.isArray(value)) {
    requireShape(value.length <= 5000);
    value.forEach((item) => bounded(item, depth + 1));
  } else if (record(value)) {
    requireShape(Object.keys(value).length <= 1000);
    Object.values(value).forEach((item) => bounded(item, depth + 1));
  } else if (typeof value === "number") requireShape(Number.isFinite(value));
}
function eventShape(event: unknown, index: number) {
  requireShape(
    record(event) && keys(event, ["sequence", "type", "epoch", "details"]),
  );
  requireShape(
    event.sequence === index + 1 &&
      Number.isSafeInteger(event.epoch) &&
      event.epoch >= 0 &&
      record(event.details),
  );
  const d = event.details;
  const simple: Record<string, string[]> = {
    transition: ["source", "destination", "edge"],
    readback: ["node", "policy", "request"],
    confirmation_withheld: ["node", "policy", "request", "code", "reason"],
    action_blocked: [
      "node",
      "source",
      "edge",
      "policy",
      "code",
      "reason",
      "request",
      "missing_fields",
    ],
    readback_blocked: [
      "node",
      "policy",
      "request",
      "code",
      "reason",
      "missing_fields",
    ],
    evaluation_error: ["code", "node", "request"],
    error: ["code", "node", "policy", "request"],
    interrupted: [],
    ended: [],
    expired: [],
  };
  if (event.type === "state") {
    requireShape(
      keys(d, ["active_stage", "pending_stage", "facts", "request"]) &&
        typeof d.active_stage === "string" &&
        values(d.facts),
    );
    requireShape(
      d.pending_stage == null || typeof d.pending_stage === "string",
    );
    requireShape(
      d.request == null ||
        (record(d.request) &&
          keys(d.request, ["name", "reference"]) &&
          typeof d.request.name === "string" &&
          typeof d.request.reference === "string"),
    );
  } else if (event.type === "tool_started") {
    requireShape(
      keys(d, ["tool", "arguments", "request"]) &&
        typeof d.tool === "string" &&
        values(d.arguments) &&
        typeof d.request === "string",
    );
  } else if (event.type === "tool_result") {
    requireShape(
      keys(d, [
        "tool",
        "status",
        "request",
        "node",
        "policy",
        "code",
        "reason",
      ]) &&
        [d.tool, d.status, d.request].every((item) => typeof item === "string"),
    );
  } else if (event.type === "retrieval")
    requireShape(keys(d, ["passages"]) && strings(d.passages));
  else {
    requireShape(
      Object.hasOwn(simple, event.type) && keys(d, simple[event.type]),
    );
    requireShape(
      Object.entries(d).every(([key, item]) =>
        key === "missing_fields"
          ? strings(item)
          : item === null || typeof item === "string",
      ),
    );
    if (event.type === "transition")
      requireShape(
        [d.source, d.destination, d.edge].every(
          (item) => typeof item === "string",
        ),
      );
  }
}
export function parseEvidence(text: string): EvidenceBundle {
  requireShape(
    text.length <= 5_000_000 &&
      new TextEncoder().encode(text).byteLength <= 5_000_000,
  );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON evidence.");
  }
  bounded(data);
  requireShape(
    record(data) &&
      keys(data, ["format", "version", "runs"]) &&
      data.format === "libretto.scenario-evidence" &&
      data.version === 1,
  );
  requireShape(
    Array.isArray(data.runs) && data.runs.length > 0 && data.runs.length <= 100,
  );
  for (const run of data.runs) {
    requireShape(
      record(run) &&
        keys(run, [
          "name",
          "passed",
          "failures",
          "stages",
          "facts",
          "actions",
          "codes",
          "completed",
          "passages",
          "context",
          "timeline",
        ]),
    );
    requireShape(
      typeof run.name === "string" &&
        typeof run.passed === "boolean" &&
        typeof run.completed === "boolean",
    );
    requireShape(
      [run.failures, run.stages, run.codes, run.passages].every(strings) &&
        values(run.facts),
    );
    const c = run.context;
    requireShape(
      record(c) &&
        keys(c, [
          "workflow_sha256",
          "workflow_id",
          "start_stage",
          "yaml_schema_version",
          "libretto_version",
          "libretto_commit",
          "source_dirty",
          "mode",
          "models",
          "speech",
          "redacted_fields",
        ]),
    );
    requireShape(
      c.mode === "scripted" &&
        /^[a-f0-9]{64}$/.test(c.workflow_sha256) &&
        typeof c.workflow_id === "string" &&
        typeof c.start_stage === "string" &&
        c.yaml_schema_version === 1,
    );
    requireShape(
      (c.libretto_version === null || typeof c.libretto_version === "string") &&
        (c.libretto_commit === null ||
          /^[a-f0-9]{40,64}$/.test(c.libretto_commit)) &&
        (c.source_dirty === null || typeof c.source_dirty === "boolean"),
    );
    requireShape(
      record(c.models) && record(c.speech) && strings(c.redacted_fields),
    );
    requireShape(Array.isArray(run.actions) && run.actions.length <= 200);
    for (const action of run.actions) {
      requireShape(
        record(action) &&
          keys(action, [
            "tool",
            "arguments",
            "status",
            "argument_fingerprint",
            "request",
          ]) &&
          values(action.arguments),
      );
      requireShape(
        [
          action.tool,
          action.status,
          action.argument_fingerprint,
          action.request,
        ].every((item) => typeof item === "string"),
      );
    }
    requireShape(Array.isArray(run.timeline) && run.timeline.length <= 5000);
    run.timeline.forEach(eventShape);
  }
  return data as EvidenceBundle;
}
export function replayState(
  run: EvidenceRun,
  index: number,
): { stage: string; facts: Record<string, Value> } {
  let stage = run.context.start_stage,
    facts: Record<string, Value> = {};
  for (const event of run.timeline.slice(0, index + 1)) {
    if (event.type === "state") {
      stage = event.details.active_stage as string;
      facts = event.details.facts as Record<string, Value>;
    } else if (event.type === "transition")
      stage = event.details.destination as string;
  }
  return { stage, facts };
}
