import { expect, it } from "vitest";
import { createStudioApi } from "./runtime-api";
it("preserves source, scope, abort signals and runtime fingerprints", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const controller = new AbortController();
  const api = createStudioApi("http://127.0.0.1:8000/", async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({ sourceFingerprint: "exact", passages: [] }),
    );
  });
  const result = await api.retrieve(
    { source: "# untouched\r\n", stepId: "ask", query: "billing", limit: 3 },
    controller.signal,
  );
  expect(result.sourceFingerprint).toBe("exact");
  expect(calls[0].url).toBe("http://127.0.0.1:8000/api/studio/retrieval");
  expect(JSON.parse(calls[0].init!.body as string)).toEqual({
    source: "# untouched\r\n",
    stepId: "ask",
    query: "billing",
    limit: 3,
  });
  expect(calls[0].init?.signal).toBe(controller.signal);
});
it("rejects structured errors instead of returning stale results", async () => {
  const api = createStudioApi(
    "",
    async () =>
      new Response(
        JSON.stringify({
          detail: [{ path: "source", message: "Outside project" }],
        }),
        { status: 422 },
      ),
  );
  await expect(api.sources("bad")).rejects.toThrow("Outside project");
});
