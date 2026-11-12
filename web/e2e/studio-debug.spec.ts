import { expect, test } from "@playwright/test";
import { parse } from "yaml";

test("Test & debug presents observed blockers beside the transcript and preserves the test snapshot", async ({
  page,
}, info) => {
  const workflow = parse(
    await (await page.request.get("/api/workflow.yaml")).text(),
  );
  let send!: (
    type: string,
    data: Record<string, unknown>,
    epoch?: number,
  ) => void;
  await page.routeWebSocket("**/api/ws", (socket) => {
    send = (type, data, epoch = 1) =>
      socket.send(JSON.stringify({ type, data, epoch, at: 1 }));
    socket.onMessage((message) => {
      const packet = JSON.parse(String(message));
      if (packet.type === "start") {
        send("ready", {
          workflow,
          mode: "text",
          credentials: {},
          call_limit_seconds: 300,
        });
        send("state", {
          active_stage: "identify",
          pending_stage: null,
          facts: {
            recipient: { value: "Sam", status: "answered", evidence: "Sam" },
          },
          receipts: [],
          request: { id: "one" },
        });
        send("turn", {
          turn_id: "one",
          text: "Can you connect me to Sam?",
          speculative: false,
        });
        send("first_text", {
          message_id: "reply",
          turn_id: "one",
          response_kind: "reply",
        });
        send("text_delta", {
          message_id: "reply",
          turn_id: "one",
          text: "I need to confirm the details before I can attempt the transfer.",
        });
        send("response_done", { message_id: "reply", turn_id: "one" });
        send("action_blocked", {
          node: "transfer",
          code: "confirmation_required",
          reason:
            "The current request needs a delivered and accepted readback.",
        });
      }
    });
  });
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Test & debug", exact: true }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Connection settings", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start test", exact: true })
    .click();
  const summary = page.getByRole("complementary", {
    name: "Runtime summary",
    exact: true,
  });
  await expect(
    summary.getByRole("heading", { name: "Action blocked", exact: true }),
  ).toBeVisible();
  await expect(summary).toContainText("delivered and accepted readback");
  await expect(
    summary.getByRole("heading", { name: "Current step", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open YAML", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath("debug-blocked-1440.png") });
  send("readback", {
    node: "confirm_transfer",
    policy: "transfer_destination",
    message_id: "readback-1",
  });
  send("first_text", {
    message_id: "readback-1",
    turn_id: "readback",
    response_kind: "readback",
  });
  send("text_delta", {
    message_id: "readback-1",
    turn_id: "readback",
    text: "Let me confirm: you would like to speak with Sam…",
  });
  send("interrupted", { message_ids: ["readback-1"] }, 2);
  await expect(
    summary.getByRole("heading", { name: "Readback interrupted", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({
    path: info.outputPath("debug-interrupted-1024.png"),
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open YAML", exact: true }),
  ).toBeEnabled();
});
