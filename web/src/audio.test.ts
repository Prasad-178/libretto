import { expect, it } from "vitest";
import { decodeAudioFrame } from "./audio";
it("decodes unaligned little-endian PCM and preserves the cancellation epoch", () => {
  const header = new TextEncoder().encode(
    JSON.stringify({ epoch: 7, speech_id: "speech-a" }),
  );
  const bytes = new Uint8Array(4 + header.length + 4);
  new DataView(bytes.buffer).setUint32(0, header.length);
  bytes.set(header, 4);
  const view = new DataView(bytes.buffer);
  view.setInt16(4 + header.length, 16384, true);
  view.setInt16(6 + header.length, -16384, true);
  const frame = decodeAudioFrame(bytes.buffer);
  expect(frame.epoch).toBe(7);
  expect([...frame.samples]).toEqual([0.5, -0.5]);
});
it("rejects malformed audio rather than playing arbitrary bytes", () => {
  expect(() => decodeAudioFrame(new ArrayBuffer(2))).toThrow();
  const bytes = new ArrayBuffer(8);
  new DataView(bytes).setUint32(0, 5000);
  expect(() => decodeAudioFrame(bytes)).toThrow();
});
