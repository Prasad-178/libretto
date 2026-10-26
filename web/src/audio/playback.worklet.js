class Playback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.phase = 0;
    this.played = 0;
    this.epoch = 0;
    this.finished = false;
    this.ticks = 0;
    this.buffered = 0;
    this.port.onmessage = ({ data }) => {
      if (data.epoch < this.epoch) return;
      this.epoch = data.epoch;
      if (data.type === "clear") {
        this.queue = [];
        this.offset = 0;
        this.phase = 0;
        this.finished = false;
        this.buffered = 0;
      } else if (data.type === "audio") {
        // Bound buffering to 12 seconds; fail closed instead of accumulating latency.
        if (this.buffered + data.samples.length > 24000 * 12) {
          this.queue = [];
          this.buffered = 0;
          this.offset = 0;
          this.port.postMessage({
            type: "overflow",
            playedMs: (this.played / sampleRate) * 1000,
            epoch: this.epoch,
          });
        } else {
          this.queue.push(data.samples);
          this.buffered += data.samples.length;
          this.finished = false;
        }
      } else if (data.type === "finish") this.finished = true;
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (!this.queue.length) {
        out[i] = 0;
        continue;
      }
      const chunk = this.queue[0];
      const a = chunk[this.offset] || 0;
      const b = chunk[Math.min(this.offset + 1, chunk.length - 1)] || 0;
      out[i] = a + (b - a) * this.phase;
      this.played++;
      this.phase += 24000 / sampleRate;
      while (this.phase >= 1 && this.queue.length) {
        this.phase -= 1;
        this.offset++;
        this.buffered--;
        if (this.offset >= this.queue[0].length) {
          this.queue.shift();
          this.offset = 0;
        }
      }
    }
    if (++this.ticks % 20 === 0 || (this.finished && !this.queue.length)) {
      const drained = this.finished && !this.queue.length;
      this.port.postMessage({
        type: drained ? "drained" : "progress",
        playedMs: (this.played / sampleRate) * 1000,
        epoch: this.epoch,
      });
      if (drained) this.finished = false;
    }
    return true;
  }
}
registerProcessor("libretto-playback", Playback);
