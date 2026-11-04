import { readWorkflow } from "../workflow";
import { createDocument, emptyMetadata } from "./document-store";
import { readStudioMetadata } from "./studio-metadata";
import type { StudioDocument, StudioMetadata } from "./types";
export const DRAFT_STORAGE_KEY = "libretto.studio.draft.v1";
export const DEVICE_STORAGE_KEY = "libretto.studio.device.v1";
export type ExportFile = { filename: string; bytes: Uint8Array; mime: string };
export function layoutFilename(filename: string): string {
  return filename.replace(/\.(ya?ml)$/i, "") + ".studio.json";
}
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function cleanMetadata(document: StudioDocument): StudioMetadata {
  const workflow =
    readWorkflow(document.source) || readWorkflow(document.importedSource);
  return workflow
    ? readStudioMetadata(JSON.stringify(document.metadata), workflow).metadata
    : emptyMetadata();
}
export async function buildExportFiles(
  document: StudioDocument,
  includeLayout: boolean,
): Promise<ExportFile[]> {
  const bytes =
    document.source === document.importedSource
      ? document.importedBytes.slice()
      : new TextEncoder().encode(document.source);
  const files: ExportFile[] = [
    {
      filename: document.filename,
      bytes,
      mime: "application/yaml;charset=utf-8",
    },
  ];
  if (includeLayout) {
    const metadata = {
      ...cleanMetadata(document),
      sourceFingerprint: await fingerprint(bytes),
    };
    files.push({
      filename: layoutFilename(document.filename),
      bytes: new TextEncoder().encode(JSON.stringify(metadata, null, 2) + "\n"),
      mime: "application/json",
    });
  }
  return files;
}
export function exportActionLabel(
  files: readonly { filename: string }[],
): string {
  return files.length === 1
    ? `Download ${files[0].filename}`
    : `Download ${files.length} files`;
}
export function documentStatus(document: StudioDocument): string {
  if (document.validation.state === "pending") return "Validating…";
  if (document.validation.state === "invalid") return "Invalid draft";
  if (document.validation.state === "unavailable")
    return "Validation unavailable";
  if (!document.exported) return "Not exported";
  return document.exported.source === document.source &&
    document.exported.filename === document.filename
    ? "Exported · unchanged"
    : "Changed since export";
}
export function serializeDraft(document: StudioDocument): string {
  return JSON.stringify({
    version: 1,
    filename: document.filename,
    source: document.source,
    importedSource: document.importedSource,
    metadata: cleanMetadata(document),
  });
}
export function restoreDraft(text: string): StudioDocument | null {
  try {
    const data = JSON.parse(text);
    if (
      data.version !== 1 ||
      typeof data.filename !== "string" ||
      data.filename.length > 240 ||
      /[\\/\0]/.test(data.filename) ||
      typeof data.source !== "string" ||
      typeof data.importedSource !== "string"
    )
      return null;
    const document = createDocument(
      data.filename,
      new TextEncoder().encode(data.importedSource),
    );
    document.source = data.source;
    document.revision = Number(data.source !== data.importedSource);
    const workflow =
      readWorkflow(data.source) || readWorkflow(data.importedSource);
    if (data.metadata && workflow)
      document.metadata = readStudioMetadata(
        JSON.stringify(data.metadata),
        workflow,
      ).metadata;
    return document;
  } catch {
    return null;
  }
}
export async function openProjectFiles(
  files: readonly File[],
): Promise<{ document: StudioDocument; notices: string[] }> {
  const yaml = files.filter((f) => /\.ya?ml$/i.test(f.name));
  const layouts = files.filter((f) => /\.studio\.json$/i.test(f.name));
  if (
    yaml.length !== 1 ||
    layouts.length > 1 ||
    files.length !== yaml.length + layouts.length
  )
    throw new Error(
      "Choose one YAML file and optionally its .studio.json layout.",
    );
  if (yaml[0].size > 400_003)
    throw new Error("Workflow exceeds 100,000 characters.");
  const document = createDocument(
    yaml[0].name,
    new Uint8Array(await yaml[0].arrayBuffer()),
  );
  if ([...document.source].length > 100_000)
    throw new Error("Workflow exceeds 100,000 characters.");
  const notices: string[] = [];
  if (layouts.length) {
    const workflow = readWorkflow(document.source);
    if (!workflow)
      notices.push("Layout was skipped until the YAML can be parsed.");
    else if (layouts[0].size > 1_000_000)
      notices.push("Layout was skipped: file exceeds 1 MB.");
    else
      try {
        const result = readStudioMetadata(await layouts[0].text(), workflow);
        document.metadata = result.metadata;
        notices.push(...result.notices);
        if (
          result.metadata.sourceFingerprint &&
          result.metadata.sourceFingerprint !==
            (await fingerprint(document.importedBytes))
        )
          notices.unshift(
            "The layout was exported for a different YAML revision. Matching hints were restored.",
          );
      } catch (error) {
        notices.push(
          `Layout was skipped: ${error instanceof Error ? error.message : "invalid file"}`,
        );
      }
  }
  return { document, notices };
}
