import type { Workflow } from "../workflow";
export type RouteRef = { source: string; edgeId: string };
export type RouteKind = "language" | "state" | "result" | "automatic" | "legacy-mixed" | "unconfigured";
export type YamlPath = readonly (string | number)[];
export type TextPatch = { from: number; to: number; insert: string };
export type EditOperation = { op: "set"; path: YamlPath; value: unknown } | { op: "delete"; path: YamlPath };
export type DocumentTransaction = { label: string; operations: readonly EditOperation[]; historyGroup?: string };
export type WorkflowIssue = { path: (string | number)[]; message: string; severity: "error" | "warning"; from?: number; to?: number };
export type ValidatedRevision = { revision: number; source: string; workflow: Workflow };
export type Point = { x: number; y: number };
export type SavedView = { id: string; name: string; visibleRoutes: RouteRef[] };
export type StudioMetadata = {
  version: 1; sourceFingerprint?: string; positions: Record<string, Point>;
  groups: { id: string; label: string; members: string[] }[];
  sourceNames: Record<string, string>; views: SavedView[];
  presentation: { target: string; mode: "auto" | "lines" | "chips" }[];
};
export type DraftSnapshot = { source: string; metadata: StudioMetadata };
export type StudioDocument = DraftSnapshot & {
  filename: string; importedBytes: Uint8Array; importedSource: string; revision: number;
  lastValid: ValidatedRevision | null;
  validation: { requestId: number; revision: number; state: "idle" | "pending" | "valid" | "invalid" | "unavailable"; issues: WorkflowIssue[] };
  past: DraftSnapshot[]; future: DraftSnapshot[]; historyGroup: string | null;
  exported: { source: string; at: number } | null; running: ValidatedRevision | null;
};
export type DocumentAction =
  | { type: "transaction"; transaction: DocumentTransaction }
  | { type: "raw-source"; source: string; historyGroup?: string }
  | { type: "metadata"; metadata: StudioMetadata; label: string }
  | { type: "end-history-group" | "undo" | "redo" | "test-stop" }
  | { type: "validation-start"; requestId: number; revision: number }
  | { type: "validation-result"; requestId: number; revision: number; source: string; workflow: Workflow | null; issues: WorkflowIssue[] }
  | { type: "validation-failure"; requestId: number; revision: number }
  | { type: "test-start"; snapshot: ValidatedRevision }
  | { type: "export-recorded"; source: string; at: number };
export type RouteDescriptor = {
  ref: RouteRef; target: string; label: string; kind: RouteKind; condition: string;
  predicate?: unknown; result?: string; timing: "next_response" | "before_action";
};
export type RoutePresentation = { refs: RouteRef[]; mode: "drawn" | "chip" | "hidden" | "bundle"; target: string };
export type GraphLayout = {
  nodes: { id: string; x: number; y: number; width: number; height: number }[];
  routes: { ref: RouteRef; points: Point[]; labelPoint: Point }[];
  unreachable: string[]; bounds: { x: number; y: number; width: number; height: number };
};
