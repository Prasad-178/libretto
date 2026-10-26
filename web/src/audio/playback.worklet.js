class Playback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.phase = 0;
    this.played = 0;
    this.epoch = 0;
    this.speechId = "";
    this.ticks = 0;
    this.buffered = 0;
    this.first = true;
    this.port.onmessage = ({ data }) => {
      if (data.epoch < this.epoch) return;
      this.epoch = data.epoch;
      if (data.type === "clear") {
        this.queue = [];
        this.offset = 0;
        this.phase = 0;
        this.buffered = 0;
        this.first = true;
      } else if (data.type === "audio") {
        if (this.buffered + data.samples.length > 24000 * 12) {
          this.queue = [];
          this.buffered = 0;
          this.offset = 0;
          this.phase = 0;
          this.report("overflow", data.speechId);
        } else {
          this.queue.push(data);
          this.buffered += data.samples.length;
        }
      } else if (data.type === "finish") this.queue.push(data);
    };
  }
  report(type, speechId = this.speechId) {
    this.port.postMessage({
      type,
      playedMs: (this.played / sampleRate) * 1000,
      epoch: this.epoch,
      speechId,
    });
  }
  drainMarkers() {
    while (this.queue.length && this.queue[0].type === "finish")
      this.report("drained", this.queue.shift().speechId);
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      this.drainMarkers();
      if (!this.queue.length) {
        out[i] = 0;
        continue;
      }
      const chunk = this.queue[0];
      this.speechId = chunk.speechId;
      const a = chunk.samples[this.offset] || 0;
      const b =
        chunk.samples[Math.min(this.offset + 1, chunk.samples.length - 1)] || 0;
      out[i] = a + (b - a) * this.phase;
      this.played++;
      if (this.first) {
        this.report("progress");
        this.first = false;
      }
      this.phase += 24000 / sampleRate;
      while (
        this.phase >= 1 &&
        this.queue.length &&
        this.queue[0].type === "audio"
      ) {
        this.phase -= 1;
        this.offset++;
        this.buffered--;
        if (this.offset >= this.queue[0].samples.length) {
          this.queue.shift();
          this.offset = 0;
        }
      }
    }
    this.drainMarkers();
    if (++this.ticks % 20 === 0) this.report("progress");
    return true;
  }
}
registerProcessor("libretto-playback", Playback);
