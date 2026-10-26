export type EventPacket = {
  type: string;
  epoch: number;
  at: number;
  data: Record<string, any>;
};
export class EpochGate {
  current = 0;
  accept(epoch: number): boolean {
    if (!Number.isSafeInteger(epoch) || epoch < this.current) return false;
    this.current = epoch;
    return true;
  }
}

export function safeExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeExport);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/(?:^|_)(?:key|secret|authorization|credentials|api_key|access_token)(?:$|_)/i.test(
              key,
            ),
        )
        .map(([key, child]) => [key, safeExport(child)]),
    );
  }
  return value;
}

export class SessionClient {
  socket: WebSocket | null = null;
  gate = new EpochGate();
  constructor(
    private onEvent: (event: EventPacket) => void,
    private onAudio: (buffer: ArrayBuffer) => void,
    private onClose: () => void,
  ) {}
  connect(start: Record<string, unknown>): void {
    this.close();
    this.gate = new EpochGate();
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${location.host}/api/ws`);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (this.socket === socket)
        socket.send(JSON.stringify({ type: "start", ...start }));
    };
    socket.onmessage = ({ data }) => {
      if (this.socket !== socket) return;
      if (data instanceof ArrayBuffer) {
        this.onAudio(data);
        return;
      }
      try {
        const event: EventPacket = JSON.parse(data);
        if (this.gate.accept(event.epoch)) this.onEvent(event);
      } catch {
        this.onEvent({
          type: "error",
          epoch: this.gate.current,
          at: 0,
          data: { message: "Invalid server event." },
        });
      }
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      this.onEvent({
        type: "error",
        epoch: this.gate.current,
        at: 0,
        data: { message: "Cannot reach the demo server." },
      });
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
        this.onClose();
      }
    };
  }
  send(event: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(event));
  }
  sendAudio(pcm: ArrayBuffer): void {
    if (
      this.socket?.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 128_000
    )
      this.socket.send(pcm);
  }
  close(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  }
}
