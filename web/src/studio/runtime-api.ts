import type { ToolManifest } from "./tool-manifest";
export type { ToolManifest } from "./tool-manifest";
export type StudioCapabilities = {
  mode: "hosted-demo" | "local-project";
  localProjectAccess: boolean;
  folderSelection: boolean;
  retrievalPreview: boolean;
  tools: ToolManifest[];
  modelChoices: { role: "response" | "evaluator"; id: string }[];
  speechChoices: { role: "stt" | "tts"; provider: string; model: string }[];
  workflowFilename?: string;
  limitations?: string[];
};
export type PassageEvidence = {
  source: string;
  document: string;
  heading: string;
  chunk_id: string;
  content_hash: string;
  text: string;
  score: number;
};
export type SourceManifest = {
  sourceFingerprint: string;
  collections: {
    id: string;
    path: string;
    missing: boolean;
    scope: { allSteps: boolean; stepIds: string[] };
    documents: { name: string; bytes: number; passages: PassageEvidence[] }[];
  }[];
  warnings: {
    code: "missing_source";
    sourceId: string;
    path: string;
    message: string;
  }[];
};
export type RetrievalPreview = {
  sourceFingerprint: string;
  stepId: string;
  query: string;
  limit: number;
  effectiveSources: string[];
  terms: string[];
  passages: PassageEvidence[];
};
export type SourceFolders = {
  folders: { path: string; markdownFiles: string[]; skippedFiles: string[] }[];
};
export class StudioApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: unknown,
  ) {
    super(message);
  }
}
export function createStudioApi(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  const base = baseUrl.replace(/\/$/, "");
  async function request<T>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetcher(base + path, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal,
    });
    const result = await response.json();
    if (!response.ok) {
      const detail = result.detail;
      const message = Array.isArray(detail)
        ? detail
            .map((issue) => issue.message || issue.msg || String(issue))
            .join("; ")
        : typeof detail === "string"
          ? detail
          : `Runtime request failed (${response.status}).`;
      throw new StudioApiError(response.status, message, detail);
    }
    return result as T;
  }
  return {
    capabilities: (signal?: AbortSignal) =>
      request<StudioCapabilities>(
        "/api/studio/capabilities",
        undefined,
        signal,
      ),
    folders: (signal?: AbortSignal) =>
      request<SourceFolders>("/api/studio/source-folders", undefined, signal),
    sources: (source: string, signal?: AbortSignal) =>
      request<SourceManifest>("/api/studio/sources", { source }, signal),
    retrieve: (
      body: { source: string; stepId: string; query: string; limit: number },
      signal?: AbortSignal,
    ) => request<RetrievalPreview>("/api/studio/retrieval", body, signal),
  };
}
