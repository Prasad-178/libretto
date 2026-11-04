import { expect, it } from "vitest";
import { voiceCredentialFields, voiceEngine } from "./voice-config";
it("defaults to LiveKit Inference credentials without individual provider keys", () => {
  expect(voiceEngine(undefined)).toBe("livekit");
  expect(voiceCredentialFields(undefined).map((field) => field.field)).toEqual([
    "livekit_api_key",
    "livekit_api_secret",
  ]);
});
it("keeps explicit legacy Deepgram credentials and deduplicates direct provider keys", () => {
  const speech = {
    stt: { provider: "deepgram", model: "flux-general-en" },
    tts: { provider: "deepgram", model: "flux-haley-en" },
  };
  expect(voiceEngine(speech)).toBe("direct");
  expect(voiceCredentialFields(speech).map((field) => field.field)).toEqual([
    "deepgram_key",
  ]);
  expect(
    voiceCredentialFields({
      ...speech,
      engine: "livekit",
      credential_mode: "providers",
    }).map((field) => field.field),
  ).toEqual(["deepgram_key"]);
});
