import { expect, it } from "vitest";
import minimal from "../../../examples/minimal.yaml?raw";
import { createDocument, documentReducer as reduce } from "./document-store";
import {
  buildExportFiles,
  layoutFilename,
  restoreDraft,
  serializeDraft,
  documentStatus,
  exportActionLabel,
} from "./project-files";
it("exports exact imported bytes, filename and an opt-in fingerprinted sidecar", async () => {
  const bytes = new TextEncoder().encode(
    "\uFEFF# header\r\n" + minimal.replaceAll("\n", "\r\n"),
  );
  const d = createDocument("survey.yml", bytes);
  expect(layoutFilename(d.filename)).toBe("survey.studio.json");
  expect((await buildExportFiles(d, false))[0].bytes).toEqual(bytes);
  const files = await buildExportFiles(d, true);
  expect(files.map((f) => f.filename)).toEqual([
    "survey.yml",
    "survey.studio.json",
  ]);
  const metadata = JSON.parse(new TextDecoder().decode(files[1].bytes));
  expect(metadata.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(exportActionLabel(files)).toBe("Download 2 files");
  expect(exportActionLabel(files.slice(0, 1))).toBe("Download survey.yml");
});
it("restores only validated draft fields without credentials or a false validation/export state", () => {
  const d = createDocument("survey.yaml", new TextEncoder().encode(minimal));
  const dirty = {
    ...d,
    endpoint: "https://secret",
    openrouter_key: "credential",
    metadata: { ...d.metadata, endpoint: "https://secret" },
  };
  const text = serializeDraft(dirty);
  expect(text).not.toContain("secret");
  expect(text).not.toContain("credential");
  const restored = restoreDraft(text)!;
  expect(restored.source).toBe(d.source);
  expect(restored.validation.state).toBe("idle");
  expect(restored.exported).toBeNull();
  expect(restoreDraft('{"version":99}')).toBeNull();
  expect(restoreDraft(JSON.stringify({ version: 1, source: 123 }))).toBeNull();
});
it("reports export ownership separately from validity and current source", () => {
  const d = createDocument("survey.yaml", new TextEncoder().encode(minimal));
  expect(documentStatus(d)).toBe("Not exported");
  const exported = reduce(d, {
    type: "export-recorded",
    source: d.source,
    at: 1,
  });
  expect(documentStatus(exported)).toBe("Exported · unchanged");
  const next = reduce(exported, {
    type: "raw-source",
    source: d.source + "# edit\n",
  });
  expect(documentStatus(next)).toBe("Changed since export");
  const pending = reduce(next, {
    type: "validation-start",
    requestId: 1,
    revision: next.revision,
  });
  expect(documentStatus(pending)).toBe("Validating…");
  expect(
    documentStatus(
      reduce(pending, {
        type: "validation-failure",
        requestId: 1,
        revision: next.revision,
      }),
    ),
  ).toBe("Validation unavailable");
});

it("opens raw YAML bytes and ignores a stale or malformed optional sidecar", async () => {
  const { openProjectFiles } = await import("./project-files");
  const yaml = new File(
    ["\uFEFF# local\r\n" + minimal.replaceAll("\n", "\r\n")],
    "survey.yml",
  );
  const layout = new File(['{"version":2}'], "survey.studio.json");
  const opened = await openProjectFiles([yaml, layout]);
  expect(opened.document.source.startsWith("\uFEFF# local\r\n")).toBe(true);
  expect(opened.notices[0]).toContain("skipped");
  expect((await buildExportFiles(opened.document, false))[0].bytes).toEqual(
    new Uint8Array(await yaml.arrayBuffer()),
  );
  await expect(openProjectFiles([yaml, yaml])).rejects.toThrow(/one YAML/);
});
