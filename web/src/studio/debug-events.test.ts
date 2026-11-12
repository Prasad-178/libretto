import { expect, it } from "vitest";
import { debugNotice } from "./debug-events";
import type { EventPacket } from "../client";
const event = (
  type: string,
  data: Record<string, unknown> = {},
  epoch = 1,
): EventPacket => ({ type, data, epoch, at: 2 });
it("shows only authoritative notices and clears them on a new turn, request or readback", () => {
  const blocked = event("action_blocked", {
    node: "book",
    code: "confirmation_required",
    reason: "A current readback is required.",
  });
  expect(debugNotice([blocked])?.node).toBe("book");
  expect(debugNotice([blocked, event("turn")])).toBeNull();
  expect(
    debugNotice([blocked, event("readback", { message_id: "fresh" })]),
  ).toBeNull();
  expect(
    debugNotice([
      event("state", { request: { id: "one" } }),
      blocked,
      event("state", { request: { id: "two" } }),
    ]),
  ).toBeNull();
  expect(
    debugNotice([event("text_delta", { text: "Booking failed" })]),
  ).toBeNull();
});
it("binds interrupted readback explanations to exact message identity", () => {
  const readback = event("readback", {
    message_id: "r",
    node: "confirm",
    policy: "booking",
  });
  expect(
    debugNotice([
      readback,
      event("interrupted", { message_ids: ["other"] }, 2),
    ]),
  ).toBeNull();
  expect(
    debugNotice([readback, event("interrupted", { message_ids: ["r"] }, 2)]),
  ).toMatchObject({
    title: "Readback interrupted",
    node: "confirm",
    policy: "booking",
  });
  expect(
    debugNotice([
      readback,
      event("playback", { drained: true, message_id: "r" }),
      event("interrupted", { message_ids: ["other"] }, 2),
    ]),
  ).toBeNull();
});
