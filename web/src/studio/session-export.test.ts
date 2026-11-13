import { expect, it } from "vitest";
import { buildSessionExport } from "./session-export";

it("exports live provenance and request references while filtering credential fields", () => {
  const input = {
    context: {
      workflow_sha256: "a".repeat(64),
      mode: "text",
      models: { speaker: "test/speaker" },
      credentials: { openrouter_key: "PRIVATE_KEY" },
    },
    messages: [{ role: "user", text: "Fictional request" }],
    receipts: [
      {
        request_id: "one",
        status: "booked",
        data: { api_secret: "PRIVATE_SECRET" },
      },
    ],
    events: [
      {
        type: "state",
        epoch: 1,
        at: 0,
        data: { request: { id: "one" }, authorization: "PRIVATE_AUTH" },
      },
      {
        type: "action_blocked",
        epoch: 1,
        at: 1,
        data: { request_id: "two", code: "missing_facts" },
      },
    ],
    timings: {},
  };
  const result = JSON.parse(
    JSON.stringify(buildSessionExport(input, "2026-11-13T00:00:00Z")),
  );
  expect(result.format).toBe("libretto.session-evidence");
  expect(result.version).toBe(1);
  expect(result.context.workflow_sha256).toBe("a".repeat(64));
  expect(result.context.models.speaker).toBe("test/speaker");
  expect(result.request_ids).toEqual(["one", "two"]);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  expect(input.context.credentials.openrouter_key).toBe("PRIVATE_KEY");
  expect(result.messages[0].text).toBe("Fictional request");
  expect(result.application_data_may_be_present).toBe(true);
});
