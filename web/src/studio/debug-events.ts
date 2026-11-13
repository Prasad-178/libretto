import type { EventPacket } from "../client";
export type DebugNotice = {
  title: string;
  reason: string;
  node?: string;
  policy?: string;
  code?: string;
  missingFields?: string[];
  source?: string;
  edge?: string;
};
/** Present observed runtime decisions, never infer authority from generated prose. */
export function debugNotice(events: EventPacket[]): DebugNotice | null {
  let notice: DebugNotice | null = null;
  let outcomeUnknown = false;
  let request: string | null | undefined;
  const readbacks = new Map<string, { node?: string; policy?: string }>();
  for (const event of events) {
    const data = event.data;
    if (event.type === "state") {
      const next = data.request?.id ?? null;
      if (request !== undefined && request !== next) {
        notice = null;
        outcomeUnknown = false;
        readbacks.clear();
      }
      request = next;
    }
    if (["turn", "tool_result", "expired"].includes(event.type)) {
      notice = null;
      outcomeUnknown = false;
    } else if (["transition", "ended"].includes(event.type) && !outcomeUnknown)
      notice = null;
    const references = {
      node: typeof data.node === "string" ? data.node : undefined,
      policy: typeof data.policy === "string" ? data.policy : undefined,
      code: typeof data.code === "string" ? data.code : undefined,
      source: typeof data.source === "string" ? data.source : undefined,
      edge: typeof data.edge === "string" ? data.edge : undefined,
      missingFields: Array.isArray(data.missing_fields)
        ? data.missing_fields.filter(
            (value: unknown) => typeof value === "string",
          )
        : undefined,
    };
    const historical =
      data.request_id && request && data.request_id !== request;
    if (
      event.type === "tool_result" &&
      data.status === "unknown" &&
      !historical
    ) {
      outcomeUnknown = true;
      notice = {
        title: "Action outcome unknown",
        reason:
          data.reason ||
          "Check the external system before retrying. Libretto will not retry automatically.",
        ...references,
      };
    }
    if (event.type === "readback") {
      notice = null;
      outcomeUnknown = false;
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
      !historical &&
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
        ...references,
      };
    if (!historical && ["evaluation_error", "error"].includes(event.type))
      notice = {
        title:
          event.type === "evaluation_error"
            ? "State update rejected"
            : "Response failed",
        reason:
          data.message || "Inspect the original runtime event for details.",
        ...references,
      };
    if (event.type === "speech_error")
      notice = {
        title: "Speech could not finish",
        reason: data.message || "The speech provider reported an error.",
      };
  }
  return notice;
}
