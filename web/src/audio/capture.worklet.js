class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.offset = 0;
    this.samples = new Int16Array(1280);
    this.energy = 0;
    this.energyCount = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.sum += value;
      this.count++;
      this.energy += value * value;
      this.energyCount++;
      this.phase += 16000 / sampleRate;
      if (this.phase >= 1) {
        const sample = Math.max(-1, Math.min(1, this.sum / this.count));
        this.samples[this.offset++] = Math.round(sample * 32767);
        this.phase -= 1;
        this.sum = 0;
        this.count = 0;
        if (this.offset === 1280) {
          const pcm = this.samples.buffer;
          this.port.postMessage(
            {
              pcm,
              rms: Math.sqrt(this.energy / Math.max(this.energyCount, 1)),
            },
            [pcm],
          );
          this.samples = new Int16Array(1280);
          this.offset = 0;
          this.energy = 0;
          this.energyCount = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("libretto-capture", Capture);
