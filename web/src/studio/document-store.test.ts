import { expect, it } from "vitest";
import minimal from "../../../examples/minimal.yaml?raw";
import { readWorkflow } from "../workflow";
import { createDocument, documentReducer as reduce } from "./document-store";
const create = () =>
  createDocument("survey.yaml", new TextEncoder().encode(minimal));
const edit = (d: ReturnType<typeof create>, value: string, group?: string) =>
  reduce(d, {
    type: "transaction",
    transaction: {
      label: "Rename",
      operations: [{ op: "set", path: ["name"], value }],
      historyGroup: group,
    },
  });
const validate = (d: ReturnType<typeof create>, id = 1) =>
  reduce(
    reduce(d, {
      type: "validation-start",
      requestId: id,
      revision: d.revision,
    }),
    {
      type: "validation-result",
      requestId: id,
      revision: d.revision,
      source: d.source,
      workflow: readWorkflow(d.source),
      issues: [],
    },
  );
it("groups edits and restores source and metadata through undo/redo", () => {
  const initial = create();
  let next = edit(edit(initial, "S", "name"), "Survey v2", "name");
  expect(next.past).toHaveLength(1);
  expect(reduce(next, { type: "undo" }).source).toBe(initial.source);
  expect(reduce(reduce(next, { type: "undo" }), { type: "redo" }).source).toBe(
    next.source,
  );
  next = validate(next);
  const metadata = {
    ...next.metadata,
    sourceNames: { company: "Company handbook" },
  };
  const metaEdit = reduce(next, {
    type: "metadata",
    metadata,
    label: "Rename source",
  });
  expect(metaEdit.revision).toBe(next.revision);
  expect(metaEdit.validation.state).toBe("valid");
  expect(reduce(metaEdit, { type: "undo" }).metadata).toEqual(next.metadata);
});
it("ignores stale validations and retains the last valid graph on invalid or unavailable drafts", () => {
  const initial = validate(create());
  const pending = reduce(initial, {
    type: "validation-start",
    requestId: 2,
    revision: initial.revision,
  });
  const draft = edit(pending, "New title");
  const stale = reduce(draft, {
    type: "validation-result",
    requestId: 2,
    revision: pending.revision,
    source: pending.source,
    workflow: readWorkflow(pending.source),
    issues: [],
  });
  expect(stale).toBe(draft);
  expect(stale.validation.state).toBe("idle");
  expect(stale.lastValid?.source).toBe(initial.source);
  const request = reduce(stale, {
    type: "validation-start",
    requestId: 3,
    revision: stale.revision,
  });
  const offline = reduce(request, {
    type: "validation-failure",
    requestId: 3,
    revision: request.revision,
  });
  expect(offline.source).toBe(draft.source);
  expect(offline.validation.state).toBe("unavailable");
  const invalid = reduce(
    reduce(offline, {
      type: "validation-start",
      requestId: 4,
      revision: offline.revision,
    }),
    {
      type: "validation-result",
      requestId: 4,
      revision: offline.revision,
      source: offline.source,
      workflow: null,
      issues: [{ path: ["name"], message: "Invalid", severity: "error" }],
    },
  );
  expect(invalid.validation.state).toBe("invalid");
  expect(invalid.lastValid).toBe(initial.lastValid);
});
it("captures only the current validated source and freezes edits while running", () => {
  const d = validate(create());
  const running = reduce(d, { type: "test-start", snapshot: d.lastValid! });
  expect(edit(running, "blocked")).toBe(running);
  expect(reduce(running, { type: "raw-source", source: "bad" })).toBe(running);
  expect(reduce(running, { type: "undo" })).toBe(running);
  expect(
    edit(reduce(running, { type: "test-stop" }), "allowed").source,
  ).toContain("allowed");
  expect(() =>
    reduce(edit(d, "changed"), { type: "test-start", snapshot: d.lastValid! }),
  ).toThrow(/validat/i);
});

it("renames the display name and filename atomically with Undo and draft restoration", async () => {
  const { buildExportFiles, serializeDraft, restoreDraft, documentStatus } =
    await import("./project-files");
  const initial = validate(create());
  const exported = reduce(initial, {
    type: "export-recorded",
    source: initial.source,
    at: 1,
  });
  const renamed = reduce(exported, {
    type: "rename",
    name: "Support desk",
    filename: "support.yaml",
  });
  expect(renamed.filename).toBe("support.yaml");
  expect(readWorkflow(renamed.source)?.name).toBe("Support desk");
  expect(restoreDraft(serializeDraft(renamed))?.filename).toBe("support.yaml");
  expect(
    (await buildExportFiles(renamed, true)).map((f) => f.filename),
  ).toEqual(["support.yaml", "support.studio.json"]);
  const undone = reduce(renamed, { type: "undo" });
  expect(undone.filename).toBe(initial.filename);
  expect(undone.source).toBe(initial.source);
  expect(reduce(undone, { type: "redo" }).filename).toBe("support.yaml");
  const fileOnly = reduce(exported, {
    type: "rename",
    name: readWorkflow(initial.source)!.name,
    filename: "new.yaml",
  });
  expect(fileOnly.validation).toBe(exported.validation);
  expect(documentStatus(fileOnly)).toBe("Changed since export");
  const running = reduce(initial, {
    type: "test-start",
    snapshot: initial.lastValid!,
  });
  expect(
    reduce(running, {
      type: "rename",
      name: "Blocked",
      filename: "blocked.yaml",
    }),
  ).toBe(running);
});
it.each(["../other.yaml", "", "bad.txt"])(
  "rejects invalid renamed filename %s",
  (filename) => {
    expect(() =>
      reduce(create(), { type: "rename", name: "Valid", filename }),
    ).toThrow();
  },
);
