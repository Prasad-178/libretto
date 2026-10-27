import type { EventPacket } from "./client";

export type Chat = {
  id: string;
  role: "user" | "assistant";
  text: string;
  interrupted?: boolean;
  delivered?: boolean;
};

export function updateDelivery(chats: Chat[], event: EventPacket): Chat[] {
  const d = event.data;
  return chats.map((m) => {
    if (m.role !== "assistant") return m;
    if (event.type === "playback" && d.drained && m.id === d.message_id)
      return { ...m, delivered: true, interrupted: false };
    if (m.delivered) return m;
    if (event.type === "interrupted" && d.message_ids?.includes(m.id))
      return { ...m, interrupted: true };
    if (event.type === "speech_interrupted" && m.id === d.message_id)
      return { ...m, text: d.text_spoken ?? m.text, interrupted: true };
    return m;
  });
}

export function retainEvent(event: EventPacket): boolean {
  return (
    !["text_delta", "draft_ready"].includes(event.type) &&
    (event.type !== "playback" || event.data.drained === true)
  );
}
