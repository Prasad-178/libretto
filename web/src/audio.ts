export type AudioFrame = {
  epoch: number;
  speechId: string;
  samples: Float32Array;
};
export function decodeAudioFrame(buffer: ArrayBuffer): AudioFrame {
  if (buffer.byteLength < 4) throw new Error("Truncated audio frame");
  const view = new DataView(buffer);
  const length = view.getUint32(0);
  if (
    length > 4096 ||
    length + 4 > buffer.byteLength ||
    (buffer.byteLength - length - 4) % 2
  )
    throw new Error("Invalid audio frame");
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 4, length)),
  );
  if (
    !Number.isSafeInteger(header.epoch) ||
    header.epoch < 0 ||
    typeof header.speech_id !== "string"
  )
    throw new Error("Invalid audio metadata");
  const count = (buffer.byteLength - 4 - length) / 2;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++)
    samples[i] = view.getInt16(4 + length + i * 2, true) / 32768;
  return { epoch: header.epoch, speechId: header.speech_id, samples };
}

export class VoiceAudio {
  private context: AudioContext | null = null;
  private player: AudioWorkletNode | null = null;
  private capture: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private latestEpoch = 0;
  private active = false;
  private lifecycle = 0;
  playedMs = 0;
  lastVoiceAt = 0;
  onProgress: (
    ms: number,
    drained: boolean,
    epoch: number,
    speechId: string,
  ) => void = () => {};
  onFirstPlayback: (
    speechId: string,
    epoch: number,
    at: number,
    method: string,
  ) => void = () => {};
  onError: (message: string) => void = () => {};
  onLevel: (level: number) => void = () => {};
  beginSession(): void {
    this.active = true;
    this.latestEpoch = 0;
    this.playedMs = 0;
    this.lastVoiceAt = 0;
  }
  async ensure(): Promise<void> {
    const lifecycle = this.lifecycle;
    if (!this.context) {
      this.context = new AudioContext({
        latencyHint: "interactive",
        sampleRate: 24000,
      });
      await this.context.audioWorklet.addModule(
        new URL("./audio/playback.worklet.js", import.meta.url).href,
      );
      if (lifecycle !== this.lifecycle || !this.context)
        throw new Error("Audio session ended");
      this.player = new AudioWorkletNode(this.context, "libretto-playback");
      this.player.connect(this.context.destination);
      this.player.port.onmessage = ({ data }) => {
        if (!this.active || lifecycle !== this.lifecycle) return;
        if (data.type === "overflow") {
          this.onError(
            "Audio buffering exceeded the limit. The response was interrupted.",
          );
          return;
        }
        if (data.type === "started") {
          const stamp = this.context?.getOutputTimestamp?.();
          const mapped =
            stamp && stamp.performanceTime && stamp.contextTime != null
              ? stamp.performanceTime +
                (data.contextTime - stamp.contextTime) * 1000
              : performance.now();
          this.onFirstPlayback(
            data.speechId,
            data.epoch,
            mapped,
            stamp?.performanceTime
              ? "output_timestamp_estimate"
              : "render_callback",
          );
          return;
        }
        this.playedMs = data.playedMs;
        this.onProgress(
          data.playedMs,
          data.type === "drained",
          data.epoch,
          data.speechId || "",
        );
      };
    }
    await this.context.resume();
  }
  async startMicrophone(send: (buffer: ArrayBuffer) => void): Promise<void> {
    const lifecycle = this.lifecycle;
    await this.ensure();
    if (this.stream) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (lifecycle !== this.lifecycle || !this.active) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Audio session ended");
    }
    this.stream = stream;
    const context = this.context!;
    await context.audioWorklet.addModule(
      new URL("./audio/capture.worklet.js", import.meta.url).href,
    );
    if (lifecycle !== this.lifecycle || !this.active)
      throw new Error("Audio session ended");
    this.capture = new AudioWorkletNode(context, "libretto-capture");
    this.capture.port.onmessage = ({ data }) => {
      if (data.rms > 0.025) this.lastVoiceAt = performance.now();
      this.onLevel(Math.min(data.rms * 6, 1));
      send(data.pcm);
    };
    this.source = context.createMediaStreamSource(this.stream);
    this.source.connect(this.capture);
    // The processor outputs silence; connecting keeps worklet execution active.
    this.capture.connect(context.destination);
  }
  stopMicrophone(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.capture?.disconnect();
    this.stream = null;
    this.source = null;
    this.capture = null;
  }
  push(frame: AudioFrame): void {
    if (!this.active || frame.epoch < this.latestEpoch || !this.player) return;
    this.latestEpoch = frame.epoch;
    this.player.port.postMessage(
      {
        type: "audio",
        samples: frame.samples,
        epoch: frame.epoch,
        speechId: frame.speechId,
      },
      [frame.samples.buffer],
    );
  }
  finish(epoch: number, speechId: string): void {
    if (this.active && epoch >= this.latestEpoch)
      this.player?.port.postMessage({ type: "finish", epoch, speechId });
  }
  interrupt(epoch: number): void {
    this.latestEpoch = Math.max(epoch, this.latestEpoch);
    this.player?.port.postMessage({ type: "clear", epoch: this.latestEpoch });
  }
  async close(): Promise<void> {
    this.active = false;
    this.lifecycle++;
    this.stopMicrophone();
    this.player?.disconnect();
    const context = this.context;
    this.context = null;
    this.player = null;
    this.latestEpoch = 0;
    this.playedMs = 0;
    if (context && context.state !== "closed") await context.close();
  }
}
