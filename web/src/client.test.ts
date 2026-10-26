import { describe, expect, it } from "vitest";
import { EpochGate, safeExport } from "./client";
describe("session protocol", () => {
  it("rejects output from an interrupted epoch without rolling back current state", () => {
    const gate = new EpochGate();
    expect(gate.accept(2)).toBe(true);
    expect(gate.accept(4)).toBe(true);
    expect(gate.accept(2)).toBe(false);
    expect(gate.current).toBe(4);
  });
  it("does not export provider keys nested in debug data", () => {
    const source = {
      type: "debug",
      data: {
        openrouter_key: "private",
        nested: { Authorization: "Bearer private" },
        text: "Hello",
      },
    };
    const exported = JSON.stringify(safeExport(source));
    expect(exported).not.toContain("private");
    expect(exported).toContain("Hello");
    expect(source.data.openrouter_key).toBe("private");
  });
});

it("ignores errors from a replaced socket", async () => {
  const { vi } = await import("vitest");
  const { SessionClient } = await import("./client");
  class Socket {
    static OPEN = 1;
    readyState = 1;
    binaryType = "";
    onopen: (() => void) | null = null;
    onmessage: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send() {}
    close() {}
  }
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:8000" });
  vi.stubGlobal("WebSocket", Socket);
  try {
    const events: unknown[] = [];
    const client = new SessionClient(
      (event) => events.push(event),
      () => {},
      () => {},
    );
    client.connect({ mode: "text" });
    const old = client.socket as unknown as Socket;
    client.connect({ mode: "text" });
    old.onerror?.();
    expect(events).toEqual([]);
    client.close();
  } finally {
    vi.unstubAllGlobals();
  }
});
