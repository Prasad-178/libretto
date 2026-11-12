export type VoiceQuery = {
  engine: "livekit" | "direct";
  credentialMode: "inference" | "providers";
  provider: string;
  model: string;
  query?: string;
  cursor?: string;
};
export type VoiceChoice = { id: string; name: string; language: string };
export type VoiceCatalog = {
  kind: "suggested" | "account" | "fixed";
  voices: VoiceChoice[];
  nextCursor: string | null;
  guidance: string;
  source: string;
  checkedAt: string;
};
