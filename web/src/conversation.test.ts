import { describe, expect, it } from "vitest";
import { updateDelivery, retainEvent, type Chat } from "./conversation";
import type { EventPacket } from "./client";
const event = (type: string, data: Record<string, unknown>): EventPacket => ({
  type,
  data,
  epoch: 2,
  at: 1,
});

describe("heard response history", () => {
  it("keeps drained speech complete when the next turn cancels generation", () => {
    const chats: Chat[] = [
      { id: "one", role: "assistant", text: "Full answer" },
    ];
    const heard = updateDelivery(
      chats,
      event("playback", { drained: true, message_id: "one" }),
    );
    expect(
      updateDelivery(heard, event("interrupted", { message_ids: [] }))[0]
        .interrupted,
    ).toBe(false);
    expect(
      updateDelivery(
        heard,
        event("speech_interrupted", { message_id: "one", text_spoken: "Full" }),
      )[0].text,
    ).toBe("Full answer");
  });
  it("marks only the cancelled reply and reconciles actual barge-in text", () => {
    const chats: Chat[] = [
      { id: "one", role: "assistant", text: "Done", delivered: true },
      { id: "two", role: "assistant", text: "Partly played answer" },
    ];
    const interrupted = updateDelivery(
      chats,
      event("interrupted", { message_ids: ["two"] }),
    );
    expect(interrupted[0].interrupted).toBeUndefined();
    expect(interrupted[1].interrupted).toBe(true);
    expect(
      updateDelivery(
        interrupted,
        event("speech_interrupted", {
          message_id: "two",
          text_spoken: "Partly",
        }),
      )[1].text,
    ).toBe("Partly");
  });
  it("retains completion diagnostics without audio progress or token noise", () => {
    expect(retainEvent(event("playback", { drained: false }))).toBe(false);
    expect(retainEvent(event("text_delta", { text: "Hello" }))).toBe(false);
    expect(retainEvent(event("playback", { drained: true }))).toBe(true);
    expect(retainEvent(event("speech_error", { code: "MESSAGE-0000" }))).toBe(
      true,
    );
  });
});
