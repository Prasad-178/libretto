export type Stats = {
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};
export function summarize(values: number[]): Stats {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    mean: n ? sorted.reduce((a, b) => a + b, 0) / n : null,
    median: n
      ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2
      : null,
    min: n ? sorted[0] : null,
    max: n ? sorted[n - 1] : null,
  };
}
type Reply = {
  speech_id: string;
  message_id: string;
  epoch: number;
  kind: string;
  audioAt?: number;
};
export type ResponseTiming = {
  speech_id: string;
  message_id: string;
  turn_id: string | null;
  epoch: number;
  kind: string;
  first_audio_received_at_ms: number;
  first_playback_at_ms: number;
  playback_clock: string;
  endpoint_to_audio_ms: number | null;
  endpoint_to_playback_ms: number | null;
  estimated_ttfs_ms: number | null;
  speech_end_reference: "microphone_rms_estimate" | null;
};
export class TurnTimings {
  private turns = new Map<
    number,
    { id: string; endpointAt: number; speechEndAt: number | null }
  >();
  private speeches = new Map<string, Reply>();
  private rag = new Map<
    number,
    { epoch: number; turn_id: string; duration_ms: number }
  >();
  private responses = new Map<string, ResponseTiming>();
  confirm(epoch: number, id: string, at: number, speechEndAt: number | null) {
    const previous = this.turns.get(epoch);
    if (previous?.id === id) {
      // Direct transcript controls and queued turn events can arrive in either order.
      this.turns.set(epoch, {
        id,
        endpointAt: Math.min(at, previous.endpointAt),
        speechEndAt: speechEndAt ?? previous.speechEndAt,
      });
    } else this.turns.set(epoch, { id, endpointAt: at, speechEndAt });
  }
  bind(id: string, messageId: string, epoch: number, kind: string) {
    if (!this.speeches.has(id))
      this.speeches.set(id, {
        speech_id: id,
        message_id: messageId,
        epoch,
        kind,
      });
  }
  audio(id: string, epoch: number, at: number) {
    const speech = this.speeches.get(id);
    if (speech?.epoch === epoch && speech.audioAt === undefined)
      speech.audioAt = at;
  }
  retrieval(epoch: number, turnId: string, duration: number) {
    if (Number.isFinite(duration) && duration >= 0)
      this.rag.set(epoch, { epoch, turn_id: turnId, duration_ms: duration });
  }
  played(
    id: string,
    epoch: number,
    at: number,
    method: string,
  ): ResponseTiming | null {
    const speech = this.speeches.get(id),
      turn = this.turns.get(epoch);
    if (
      !speech ||
      speech.epoch !== epoch ||
      speech.audioAt === undefined ||
      at < speech.audioAt ||
      this.responses.has(id)
    )
      return null;
    const reference = turn?.speechEndAt;
    const validMic =
      reference != null &&
      reference > 0 &&
      reference <= turn!.endpointAt &&
      turn!.endpointAt - reference < 15000;
    const result: ResponseTiming = {
      speech_id: id,
      message_id: speech.message_id,
      epoch,
      kind: speech.kind,
      turn_id: turn?.id ?? null,
      first_audio_received_at_ms: speech.audioAt,
      first_playback_at_ms: at,
      playback_clock: method,
      endpoint_to_audio_ms: turn
        ? Math.max(0, speech.audioAt - turn.endpointAt)
        : null,
      endpoint_to_playback_ms: turn ? Math.max(0, at - turn.endpointAt) : null,
      estimated_ttfs_ms: validMic ? at - reference! : null,
      speech_end_reference: validMic ? "microphone_rms_estimate" : null,
    };
    this.responses.set(id, result);
    return result;
  }
  export() {
    const responses = [...this.responses.values()];
    const replies = responses.filter((r) => r.kind === "reply");
    const retrieval_attempts = [...this.rag.values()];
    return {
      clock: "browser_performance_ms",
      responses,
      retrieval_attempts,
      summary: {
        estimated_ttfs_ms: summarize(
          replies.flatMap((r) =>
            r.estimated_ttfs_ms === null ? [] : [r.estimated_ttfs_ms],
          ),
        ),
        endpoint_to_playback_ms: summarize(
          replies.flatMap((r) =>
            r.endpoint_to_playback_ms === null
              ? []
              : [r.endpoint_to_playback_ms],
          ),
        ),
        retrieval_ms: summarize(
          retrieval_attempts
            .filter((r) => this.turns.get(r.epoch)?.id === r.turn_id)
            .map((r) => r.duration_ms),
        ),
      },
    };
  }
}
