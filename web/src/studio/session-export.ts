import { safeExport, type EventPacket } from "../client";

type SessionExportInput = {
  context: Record<string, unknown> | null;
  messages: unknown[];
  receipts: Record<string, unknown>[];
  events: EventPacket[];
  timings: unknown;
};

/** Live data remains a deliberate local export, separate from inert scripted replay. */
export function buildSessionExport(
  input: SessionExportInput,
  capturedAt = new Date().toISOString(),
): unknown {
  const requestIds = new Set<string>();
  for (const event of input.events) {
    const id = event.data.request?.id || event.data.request_id;
    if (typeof id === "string") requestIds.add(id);
  }
  for (const receipt of input.receipts)
    if (typeof receipt.request_id === "string")
      requestIds.add(receipt.request_id);
  const context =
    input.context &&
    Object.fromEntries(
      [
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
      ]
        .filter((key) => Object.hasOwn(input.context!, key))
        .map((key) => [key, input.context![key]]),
    );
  return safeExport({
    format: "libretto.session-evidence",
    version: 1,
    project: "Libretto",
    captured_at: capturedAt,
    context,
    request_ids: [...requestIds],
    application_data_may_be_present: true,
    messages: input.messages,
    receipts: input.receipts,
    events: input.events,
    timings: input.timings,
  });
}
