import type { EventPacket } from "../client";
export type DebugNotice = {
  title: string;
  reason: string;
  node?: string;
  policy?: string;
};
/** Present observed runtime decisions, never infer authority from generated prose. */
export function debugNotice(events: EventPacket[]): DebugNotice | null {
  let notice: DebugNotice | null = null;
  let request: string | null | undefined;
  const readbacks = new Map<string, { node?: string; policy?: string }>();
  for (const event of events) {
    const data = event.data;
    if (event.type === "state") {
      const next = data.request?.id ?? null;
      if (request !== undefined && request !== next) {
        notice = null;
        readbacks.clear();
      }
      request = next;
    }
    if (
      ["turn", "tool_result", "transition", "ended", "expired"].includes(
        event.type,
      )
    )
      notice = null;
    if (event.type === "readback") {
      notice = null;
      readbacks.set(data.message_id, { node: data.node, policy: data.policy });
    }
    if (event.type === "playback" && data.drained) {
      readbacks.delete(data.message_id);
    }
    if (event.type === "interrupted" || event.type === "speech_interrupted") {
      const ids =
        event.type === "interrupted"
          ? data.message_ids || []
          : [data.message_id];
      for (const id of ids)
        if (readbacks.has(id)) {
          notice = {
            title: "Readback interrupted",
            reason:
              "The complete readback was not heard. Ask for the details again, then confirm on a later turn.",
            ...readbacks.get(id),
          };
          readbacks.delete(id);
        }
    }
    if (
      ["confirmation_withheld", "action_blocked", "readback_blocked"].includes(
        event.type,
      )
    )
      notice = {
        title:
          event.type === "action_blocked"
            ? "Action blocked"
            : event.type === "readback_blocked"
              ? "Readback paused"
              : "Confirmation withheld",
        reason: data.reason || "See the runtime event for details.",
        node: data.node,
        policy: data.policy,
      };
    if (event.type === "speech_error")
      notice = {
        title: "Speech could not finish",
        reason: data.message || "The speech provider reported an error.",
      };
  }
  return notice;
}
