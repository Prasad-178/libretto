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
  playedMs = 0;
  lastVoiceAt = 0;
  onProgress: (ms: number, drained: boolean, epoch: number) => void = () => {};
  onLevel: (level: number) => void = () => {};
  async ensure(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({
        latencyHint: "interactive",
        sampleRate: 24000,
      });
      await this.context.audioWorklet.addModule(
        new URL("./audio/playback.worklet.js", import.meta.url).href,
      );
      this.player = new AudioWorkletNode(this.context, "libretto-playback");
      this.player.connect(this.context.destination);
      this.player.port.onmessage = ({ data }) => {
        this.playedMs = data.playedMs;
        this.onProgress(data.playedMs, data.type === "drained", data.epoch);
      };
    }
    await this.context.resume();
  }
  async startMicrophone(send: (buffer: ArrayBuffer) => void): Promise<void> {
    await this.ensure();
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const context = this.context!;
    await context.audioWorklet.addModule(
      new URL("./audio/capture.worklet.js", import.meta.url).href,
    );
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
    if (frame.epoch < this.latestEpoch || !this.player) return;
    this.latestEpoch = frame.epoch;
    this.player.port.postMessage(
      { type: "audio", samples: frame.samples, epoch: frame.epoch },
      [frame.samples.buffer],
    );
  }
  finish(epoch: number): void {
    if (epoch >= this.latestEpoch)
      this.player?.port.postMessage({ type: "finish", epoch });
  }
  interrupt(epoch: number): void {
    this.latestEpoch = Math.max(epoch, this.latestEpoch);
    this.player?.port.postMessage({ type: "clear", epoch: this.latestEpoch });
  }
  async close(): Promise<void> {
    this.stopMicrophone();
    this.player?.disconnect();
    if (this.context) await this.context.close();
    this.context = null;
    this.player = null;
    this.latestEpoch = 0;
    this.playedMs = 0;
  }
}
