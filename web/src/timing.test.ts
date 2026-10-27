import { expect, it } from "vitest";
import { TurnTimings } from "./timing";

it("records audio arrival and actual playback separately and deduplicates progress", () => {
  const t = new TurnTimings();
  t.confirm(2, "turn-1", 1000, 800);
  t.bind("speech-1", "reply-1", 2, "reply");
  t.audio("speech-1", 2, 1200);
  t.audio("speech-1", 2, 1250);
  const result = t.played("speech-1", 2, 1400, "output_timestamp");
  expect(result?.endpoint_to_audio_ms).toBe(200);
  expect(result?.endpoint_to_playback_ms).toBe(400);
  expect(result?.estimated_ttfs_ms).toBe(600);
  expect(t.played("speech-1", 2, 1600, "output_timestamp")).toBeNull();
  expect(t.export().responses).toHaveLength(1);
});
it("excludes readbacks and tool follow-ups from reply TTFS and summarizes confirmed RAG", () => {
  const t = new TurnTimings();
  for (const [epoch, gap, kind] of [
    [1, 200, "reply"],
    [2, 400, "reply"],
    [3, 100, "readback"],
  ] as const) {
    t.confirm(epoch, `turn-${epoch}`, 1000, 900);
    t.retrieval(epoch, `turn-${epoch}`, epoch);
    t.bind(`speech-${epoch}`, `reply-${epoch}`, epoch, kind);
    t.audio(`speech-${epoch}`, epoch, 1050);
    t.played(`speech-${epoch}`, epoch, 1000 + gap, "render_callback");
  }
  t.retrieval(4, "cancelled-draft", 100);
  expect(t.export().summary.estimated_ttfs_ms).toEqual({
    count: 2,
    mean: 400,
    median: 400,
    min: 300,
    max: 500,
  });
  expect(t.export().summary.retrieval_ms).toEqual({
    count: 3,
    mean: 2,
    median: 2,
    min: 1,
    max: 3,
  });
  expect(t.export().retrieval_attempts).toHaveLength(4);
});
it("does not invent an acoustic TTFS for text input, stale mic activity or cancelled epochs", () => {
  const t = new TurnTimings();
  t.confirm(2, "text-turn", 2000, null);
  t.bind("speech", "reply", 2, "reply");
  t.audio("speech", 2, 2100);
  expect(t.played("speech", 1, 2200, "render_callback")).toBeNull();
  expect(
    t.played("speech", 2, 2200, "render_callback")?.estimated_ttfs_ms,
  ).toBeNull();
  expect(t.export().summary.estimated_ttfs_ms.count).toBe(0);
});

it("preserves the microphone reference regardless of transcript and turn event ordering", () => {
  for (const order of ["transcript-first", "turn-first"]) {
    const t = new TurnTimings();
    if (order === "transcript-first") {
      t.confirm(2, "voice", 1000, 800);
      t.confirm(2, "voice", 1001, null);
    } else {
      t.confirm(2, "voice", 1001, null);
      t.confirm(2, "voice", 1000, 800);
    }
    t.bind("speech", "reply", 2, "reply");
    t.audio("speech", 2, 1200);
    expect(
      t.played("speech", 2, 1400, "render_callback")?.estimated_ttfs_ms,
    ).toBe(600);
  }
});
