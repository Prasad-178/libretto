import { applyTransaction } from "./yaml-edits";
import type {
  DocumentAction,
  DraftSnapshot,
  StudioDocument,
  StudioMetadata,
} from "./types";
export type {
  DocumentAction,
  StudioDocument,
  DocumentTransaction,
} from "./types";
export const emptyMetadata = (): StudioMetadata => ({
  version: 1,
  positions: Object.create(null),
  groups: [],
  sourceNames: Object.create(null),
  views: [],
  presentation: [],
});
export function createDocument(
  filename: string,
  bytes: Uint8Array,
): StudioDocument {
  const source = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  return {
    filename,
    source,
    importedSource: source,
    importedBytes: bytes.slice(),
    metadata: emptyMetadata(),
    revision: 0,
    lastValid: null,
    validation: { requestId: 0, revision: 0, state: "idle", issues: [] },
    past: [],
    future: [],
    historyGroup: null,
    exported: null,
    running: null,
  };
}
function snapshot(d: StudioDocument): DraftSnapshot {
  return { source: d.source, metadata: d.metadata };
}
function change(
  d: StudioDocument,
  next: DraftSnapshot,
  group: string | null = null,
): StudioDocument {
  if (next.source === d.source && next.metadata === d.metadata) return d;
  const executable = next.source !== d.source;
  const revision = d.revision + Number(executable);
  return {
    ...d,
    ...next,
    revision,
    validation: executable
      ? { ...d.validation, revision, state: "idle", issues: [] }
      : d.validation,
    past:
      group && group === d.historyGroup
        ? d.past
        : [...d.past.slice(-99), snapshot(d)],
    future: [],
    historyGroup: group,
  };
}
export function documentReducer(
  d: StudioDocument,
  action: DocumentAction,
): StudioDocument {
  switch (action.type) {
    case "transaction":
      return d.running
        ? d
        : change(
            d,
            {
              ...snapshot(d),
              source: applyTransaction(d.source, action.transaction).source,
            },
            action.transaction.historyGroup || null,
          );
    case "raw-source":
      return d.running
        ? d
        : change(
            d,
            { ...snapshot(d), source: action.source },
            action.historyGroup || null,
          );
    case "metadata":
      return d.running
        ? d
        : change(d, { ...snapshot(d), metadata: action.metadata });
    case "end-history-group":
      return { ...d, historyGroup: null };
    case "undo":
    case "redo": {
      if (d.running) return d;
      const stack = action.type === "undo" ? d.past : d.future;
      const next = stack.at(-1);
      if (!next) return d;
      const executable = next.source !== d.source;
      const revision = d.revision + Number(executable);
      return {
        ...d,
        ...next,
        revision,
        historyGroup: null,
        past:
          action.type === "undo"
            ? d.past.slice(0, -1)
            : [...d.past, snapshot(d)],
        future:
          action.type === "undo"
            ? [...d.future, snapshot(d)]
            : d.future.slice(0, -1),
        validation: executable
          ? { ...d.validation, revision, state: "idle", issues: [] }
          : d.validation,
      };
    }
    case "validation-start":
      return action.revision !== d.revision
        ? d
        : {
            ...d,
            validation: {
              requestId: action.requestId,
              revision: action.revision,
              state: "pending",
              issues: [],
            },
          };
    case "validation-result": {
      if (
        action.requestId !== d.validation.requestId ||
        action.revision !== d.revision ||
        action.source !== d.source
      )
        return d;
      const valid =
        !!action.workflow &&
        !action.issues.some((issue) => issue.severity === "error");
      return {
        ...d,
        validation: {
          ...d.validation,
          state: valid ? "valid" : "invalid",
          issues: action.issues,
        },
        lastValid: valid
          ? {
              revision: d.revision,
              source: d.source,
              workflow: action.workflow!,
            }
          : d.lastValid,
      };
    }
    case "validation-failure":
      return action.requestId !== d.validation.requestId ||
        action.revision !== d.revision
        ? d
        : {
            ...d,
            validation: { ...d.validation, state: "unavailable", issues: [] },
          };
    case "test-start": {
      if (
        d.validation.state !== "valid" ||
        action.snapshot.revision !== d.revision ||
        action.snapshot.source !== d.source ||
        d.lastValid !== action.snapshot
      )
        throw new Error("Validate the current draft before starting a test.");
      return { ...d, running: action.snapshot, historyGroup: null };
    }
    case "test-stop":
      return { ...d, running: null };
    case "export-recorded":
      return { ...d, exported: { source: action.source, at: action.at } };
  }
}
