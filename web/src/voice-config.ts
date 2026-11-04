import type { Workflow } from "./workflow";

export function voiceEngine(speech: Workflow["speech"]): "livekit" | "direct" {
  return (
    speech?.engine ||
    (speech?.stt?.provider === "deepgram" &&
    speech?.stt?.model === "flux-general-en" &&
    speech?.tts?.provider === "deepgram" &&
    speech?.tts?.model === "flux-haley-en"
      ? "direct"
      : "livekit")
  );
}

export const voicePresets = {
  livekit: {
    engine: "livekit",
    credential_mode: "inference",
    stt: { provider: "assemblyai", model: "universal-streaming" },
    tts: {
      provider: "cartesia",
      model: "sonic-3",
      voice: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    },
  },
  direct: {
    engine: "direct",
    credential_mode: "providers",
    stt: { provider: "deepgram", model: "flux-general-en" },
    tts: { provider: "deepgram", model: "flux-haley-en" },
  },
} as const;

export function voiceCredentialFields(speech: Workflow["speech"]) {
  const legacy = voiceEngine(speech) === "direct";
  if (!legacy && speech?.credential_mode !== "providers") {
    return [
      {
        field: "livekit_api_key",
        status: "livekit_api_key",
        label: "LiveKit API key",
      },
      {
        field: "livekit_api_secret",
        status: "livekit_api_secret",
        label: "LiveKit API secret",
      },
    ];
  }
  const providers = legacy
    ? ["deepgram"]
    : [
        ...new Set([
          speech?.stt?.provider || "assemblyai",
          speech?.tts?.provider || "cartesia",
        ]),
      ];
  const labels: Record<string, string> = {
    deepgram: "Deepgram",
    assemblyai: "AssemblyAI",
    cartesia: "Cartesia",
  };
  return providers.map((provider) => ({
    field: `${provider}_key`,
    status: provider,
    label: `${labels[provider] || provider} API key`,
  }));
}
