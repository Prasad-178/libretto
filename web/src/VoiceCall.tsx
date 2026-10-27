import type { RefObject } from "react";
import { Mic, MicOff, PhoneOff, Square, Volume2 } from "lucide-react";

export function VoiceOrb({
  state,
  orbRef,
}: {
  state: string;
  orbRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="call-orb-wrap"
      data-state={state}
      aria-hidden="true"
      ref={orbRef}
    >
      <div className="call-orb-halo" />
      <div className="call-orb">
        <div className="call-orb-current" />
        <div className="call-orb-light" />
        <div className="call-orb-glass" />
      </div>
      <div className="call-orb-shadow" />
    </div>
  );
}

export function VoiceCall({
  name,
  phase,
  connecting,
  mic,
  remaining,
  orbRef,
  onMute,
  onEnd,
  onInterrupt,
}: {
  name: string;
  phase: string;
  connecting: boolean;
  mic: boolean;
  remaining: number;
  orbRef: RefObject<HTMLDivElement | null>;
  onMute: () => void;
  onEnd: () => void;
  onInterrupt: () => void;
}) {
  const speaking = phase === "Speaking";
  const thinking = ["Thinking", "Preparing a reply", "Responding"].includes(
    phase,
  );
  const state = connecting
    ? "connecting"
    : speaking
      ? "speaking"
      : thinking
        ? "thinking"
        : !mic
          ? "muted"
          : "listening";
  const label = connecting
    ? "Connecting your call"
    : speaking
      ? "Speaking to you"
      : thinking
        ? "Thinking it through"
        : !mic
          ? "Microphone muted"
          : "Listening to you";
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <section className="live-call" aria-label="Voice call">
      <div className="call-topline">
        <span>
          <i />
          {connecting ? "Connecting" : "Live conversation"}
        </span>
        <time aria-label={`${time} remaining`}>{time}</time>
      </div>
      <VoiceOrb state={state} orbRef={orbRef} />
      <div className="call-caption">
        <p>{name}</p>
        <h2 role="status">{label}</h2>
        <span>
          {speaking ? (
            <>
              <Volume2 size={12} />
              {mic ? "You can interrupt naturally" : "Your microphone is muted"}
            </>
          ) : mic ? (
            "Take your time. Speak naturally."
          ) : (
            "You can still type below."
          )}
        </span>
      </div>
      <div className="call-actions">
        <button
          type="button"
          className={`call-mute ${!mic ? "is-muted" : ""}`}
          disabled={connecting}
          aria-pressed={!mic}
          aria-label={mic ? "Mute microphone" : "Unmute microphone"}
          onClick={onMute}
        >
          {mic ? <Mic size={19} /> : <MicOff size={19} />}
          <span>{mic ? "Mute" : "Unmute"}</span>
        </button>
        <button type="button" className="call-end" onClick={onEnd}>
          <PhoneOff size={19} />
          <span>End call</span>
        </button>
      </div>
      <button
        type="button"
        className="call-interrupt"
        onClick={onInterrupt}
        disabled={connecting || (!speaking && !thinking)}
      >
        <Square size={10} /> Stop response
      </button>
    </section>
  );
}
