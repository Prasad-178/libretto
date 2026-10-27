import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function player() {
  let Processor;
  const messages = [];
  class Base {
    port = { postMessage: (message) => messages.push(message) };
  }
  runInNewContext(
    readFileSync(
      new URL("./audio/playback.worklet.js", import.meta.url),
      "utf8",
    ),
    {
      AudioWorkletProcessor: Base,
      sampleRate: 24000,
      currentFrame: 0,
      registerProcessor: (name, ctor) => (Processor = ctor),
    },
  );
  const worklet = new Processor();
  return {
    worklet,
    messages,
    send: (data) => worklet.port.onmessage({ data }),
    render: (n) => {
      const out = new Float32Array(n);
      worklet.process([], [[out]]);
      return [...out];
    },
  };
}
it("preserves playback order and emits a separate drained marker per speech", () => {
  const p = player();
  p.send({
    type: "audio",
    epoch: 1,
    speechId: "one",
    samples: new Float32Array([0.1, 0.2]),
  });
  p.send({ type: "finish", epoch: 1, speechId: "one" });
  p.send({
    type: "audio",
    epoch: 1,
    speechId: "two",
    samples: new Float32Array([0.3, 0.4]),
  });
  p.send({ type: "finish", epoch: 1, speechId: "two" });
  expect(p.render(5).map((n) => +n.toFixed(1))).toEqual([
    0.1, 0.2, 0.3, 0.4, 0,
  ]);
  expect(
    p.messages.filter((m) => m.type === "drained").map((m) => m.speechId),
  ).toEqual(["one", "two"]);
});
it("drops interrupted frames and reports bounded-buffer overflow", () => {
  const p = player();
  p.send({
    type: "audio",
    epoch: 1,
    speechId: "old",
    samples: new Float32Array([0.7]),
  });
  p.send({ type: "clear", epoch: 2 });
  p.send({
    type: "audio",
    epoch: 1,
    speechId: "old",
    samples: new Float32Array([0.8]),
  });
  expect(p.render(1)).toEqual([0]);
  p.send({
    type: "audio",
    epoch: 2,
    speechId: "new",
    samples: new Float32Array(24000 * 13),
  });
  expect(p.messages.some((m) => m.type === "overflow")).toBe(true);
});

it("reports first rendered sample once per speech, including two speeches in one epoch", () => {
  const p = player();
  for (const id of ["one", "two"]) {
    p.send({
      type: "audio",
      epoch: 1,
      speechId: id,
      samples: new Float32Array([0.5]),
    });
    p.send({ type: "finish", epoch: 1, speechId: id });
  }
  p.render(4);
  const starts = p.messages.filter((m) => m.type === "started");
  expect(starts.map((m) => m.speechId)).toEqual(["one", "two"]);
  expect(starts[0].contextTime).toBe(0);
  expect(starts[1].contextTime).toBe(1 / 24000);
});
