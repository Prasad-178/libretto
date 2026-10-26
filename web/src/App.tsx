import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Code2,
  Download,
  ExternalLink,
  GitBranch,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  Plus,
  Radio,
  Send,
  Settings2,
  Square,
  Terminal,
  Volume2,
  X,
} from "lucide-react";
import { SessionClient, safeExport, type EventPacket } from "./client";
import { decodeAudioFrame, VoiceAudio } from "./audio";
import { StageRail, WorkflowMap, type Workflow } from "./Flow";

type Chat = {
  id: string;
  role: "user" | "assistant";
  text: string;
  interrupted?: boolean;
};
type Fact = {
  value: string | boolean | null;
  status: string;
  evidence: string;
};
type Config = {
  workflow: Workflow;
  credentials: Record<string, string>;
  call_limit_seconds: number;
};
const examples = [
  "What are your support hours?",
  "Can I speak to Maya in billing?",
  "I’d like to leave a message.",
];
const pretty = (text: string) =>
  text.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState("Ready when you are");
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [orKey, setOrKey] = useState("");
  const [dgKey, setDgKey] = useState("");
  const [speakerModel, setSpeakerModel] = useState("");
  const [evaluatorModel, setEvaluatorModel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState("unavailable");
  const [active, setActive] = useState("identify");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState("identify");
  const [visited, setVisited] = useState(new Set<string>());
  const [facts, setFacts] = useState<Record<string, Fact>>({});
  const [sources, setSources] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [input, setInput] = useState("");
  const [view, setView] = useState<"conversation" | "workflow">("conversation");
  const [inspector, setInspector] = useState<"state" | "sources" | "trace">(
    "state",
  );
  const [trace, setTrace] = useState<EventPacket[]>([]);
  const [remaining, setRemaining] = useState(180);
  const [gap, setGap] = useState<number | null>(null);
  const [mic, setMic] = useState(false);
  const [level, setLevel] = useState(0);
  const client = useRef<SessionClient | null>(null);
  const audio = useRef(new VoiceAudio());
  const deadline = useRef(0);
  const traceRef = useRef<EventPacket[]>([]);
  const activeReply = useRef("");
  const lastInputAt = useRef(0);
  const firstAudioEpoch = useRef(-1);
  const ready = useRef(false);
  const handleRef = useRef<(event: EventPacket) => void>(() => {});
  const bottom = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  function upsertUser(id: string, text: string) {
    setChats((old) =>
      old.some((m) => m.id === id) ? old : [...old, { id, role: "user", text }],
    );
  }
  function handleEvent(event: EventPacket) {
    const d = event.data;
    traceRef.current = [...traceRef.current.slice(-499), event];
    if (!["text_delta", "playback", "draft_ready"].includes(event.type))
      setTrace((old) => [...old.slice(-99), event]);
    if (event.type === "ready") {
      ready.current = true;
      setConnected(true);
      setConnecting(false);
      setSettings(false);
      setError("");
      setCredentials(d.credentials);
      setPhase("Listening");
      setOrKey("");
      setDgKey("");
      deadline.current = performance.now() + (180 - event.at) * 1000;
      if (d.mode === "voice") void enableMicrophone();
    } else if (event.type === "state") {
      setActive(d.active_stage);
      setPending(d.pending_stage);
      setFacts(d.facts);
      setReceipts(d.receipts);
      setVisited((old) => new Set([...old, d.active_stage]));
    } else if (event.type === "turn") {
      setPhase(d.speculative ? "Preparing a reply" : "Thinking");
      if (!d.speculative) upsertUser(d.turn_id, d.text);
    } else if (event.type === "transcript") {
      upsertUser(d.turn_id, d.text);
      lastInputAt.current = audio.current.lastVoiceAt || performance.now();
    } else if (event.type === "retrieval") setSources(d.passages);
    else if (event.type === "first_text")
      activeReply.current = `${d.turn_id}-${event.epoch}-${event.at}`;
    else if (event.type === "text_delta") {
      setPhase("Responding");
      const id = activeReply.current || `${d.turn_id}-${event.epoch}`;
      setChats((old) => {
        const found = old.find((m) => m.id === id);
        return found
          ? old.map((m) => (m.id === id ? { ...m, text: m.text + d.text } : m))
          : [...old, { id, role: "assistant", text: d.text }];
      });
    } else if (event.type === "response_done") {
      if (mode === "text") setPhase("Listening");
    } else if (event.type === "speech_finished") {
      if (d.epoch === client.current?.gate.current)
        audio.current.finish(d.epoch);
    } else if (event.type === "interrupted") {
      audio.current.interrupt(event.epoch);
      setPhase("Listening");
      setChats((old) =>
        old.map((m) =>
          m.id === activeReply.current ? { ...m, interrupted: true } : m,
        ),
      );
    } else if (event.type === "error" || event.type === "speech_error") {
      setError(d.message || "The provider could not complete this request.");
      setConnecting(false);
      if (!ready.current) {
        client.current?.close();
        void audio.current.close();
        setMic(false);
      }
      if (
        [
          "budget_exhausted",
          "invalid_key",
          "missing_openrouter_key",
          "missing_deepgram_key",
        ].includes(d.code)
      )
        setSettings(true);
    } else if (event.type === "expired" || event.type === "ended") {
      setPhase(
        event.type === "expired"
          ? "Session complete · 3 minute limit"
          : "Conversation complete",
      );
      ready.current = false;
      setConnected(false);
      setMic(false);
      setOrKey("");
      setDgKey("");
      audio.current.stopMicrophone();
      audio.current.interrupt(event.epoch);
      if (event.type === "expired") client.current?.close();
    } else if (event.type === "credentials_updated") {
      setCredentials(d.credentials);
      setSettings(false);
      setOrKey("");
      setDgKey("");
      setError("");
    }
  }
  handleRef.current = handleEvent;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: Config) => {
        setConfig(data);
        setCredentials(data.credentials);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            "The Libretto backend is not reachable. Start it on port 8000.",
          );
      });
    client.current = new SessionClient(
      (e) => handleRef.current(e),
      (buffer) => {
        try {
          const frame = decodeAudioFrame(buffer);
          if (!client.current?.gate.accept(frame.epoch)) return;
          if (firstAudioEpoch.current !== frame.epoch)
            firstAudioEpoch.current = frame.epoch;
          audio.current.push(frame);
        } catch {
          setError("An audio frame could not be played.");
        }
      },
      () => {
        ready.current = false;
        setConnected(false);
        setConnecting(false);
        setMic(false);
        void audio.current.close();
        setPhase("Disconnected · start a fresh session");
      },
    );
    audio.current.onProgress = (ms, drained, epoch) => {
      if (!ready.current) return;
      client.current?.send({
        type: "playback",
        playback_ms: ms,
        drained,
        epoch,
      });
      if (drained) setPhase("Listening");
      if (firstAudioEpoch.current === epoch && lastInputAt.current) {
        setGap(performance.now() - lastInputAt.current);
        firstAudioEpoch.current = -2;
        lastInputAt.current = 0;
      }
    };
    audio.current.onLevel = (value) => setLevel(value);
    return () => {
      controller.abort();
      client.current?.close();
      void audio.current.close();
    };
  }, []);
  useEffect(() => {
    if (settings) dialog.current?.showModal();
    else dialog.current?.close();
  }, [settings]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chats]);
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(
      () =>
        setRemaining(
          Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)),
        ),
      250,
    );
    return () => clearInterval(timer);
  }, [connected]);

  async function enableMicrophone() {
    try {
      await audio.current.startMicrophone((pcm) => {
        if (ready.current) client.current?.sendAudio(pcm);
      });
      setMic(true);
    } catch {
      setError(
        "Microphone access is unavailable. Allow it in your browser, or use text mode.",
      );
      setMic(false);
    }
  }
  async function connect() {
    if (connected) {
      client.current?.send({
        type: "credentials",
        openrouter_key: orKey,
        deepgram_key: dgKey,
      });
      return;
    }
    try {
      if (mode === "voice") await audio.current.ensure();
      setError("");
      setConnecting(true);
      setPhase("Connecting");
      setRemaining(180);
      setGap(null);
      setChats([]);
      setFacts({});
      setSources([]);
      setReceipts([]);
      setTrace([]);
      traceRef.current = [];
      setActive(config?.workflow.start || "identify");
      setVisited(new Set());
      client.current?.connect({
        mode,
        openrouter_key: orKey,
        deepgram_key: dgKey,
        transfer_outcome: outcome,
        speaker_model: speakerModel,
        evaluator_model: evaluatorModel,
      });
    } catch {
      setConnecting(false);
      setError("Audio playback is unavailable. Try text mode.");
    }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    if (!connected) {
      setSettings(true);
      return;
    }
    const id = crypto.randomUUID();
    audio.current.interrupt((client.current?.gate.current || 0) + 1);
    upsertUser(id, input.trim());
    lastInputAt.current = performance.now();
    client.current?.send({ type: "text", text: input.trim(), turn_id: id });
    setInput("");
  }
  function stop() {
    audio.current.interrupt((client.current?.gate.current || 0) + 1);
    client.current?.send({
      type: "interrupt",
      playback_ms: audio.current.playedMs,
    });
  }
  function end() {
    client.current?.send({ type: "close" });
    client.current?.close();
    void audio.current.close();
    ready.current = false;
    setConnected(false);
    setMic(false);
    setPhase("Conversation ended");
    setOrKey("");
    setDgKey("");
  }
  function download() {
    const content = safeExport({
      project: "Libretto",
      captured_at: new Date().toISOString(),
      messages: chats,
      receipts,
      events: traceRef.current,
    });
    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "libretto-session.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  const workflow = config?.workflow;
  const inspected = workflow?.nodes[selected];
  const minutes = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Libretto home">
          <span className="brand-mark">
            l<span>·</span>
          </span>
          libretto<span className="wordmark-period">.</span>
        </a>
        <span className="topbar-caption">VOICE WORKFLOWS, WRITTEN IN YAML</span>
        <div className="top-actions">
          <a
            href="/api/workflow.yaml"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            <Code2 size={14} /> View YAML <ExternalLink size={11} />
          </a>
          <button
            className="icon-button"
            title="Connection settings"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={17} />
          </button>
          <span className="version">v0.1 / demo</span>
        </div>
      </header>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            THE RECEPTIONIST EXPERIMENT <span>01</span>
          </div>
          <h1>
            A voice. A flow. <em>A little direction.</em>
          </h1>
          <p>
            A front desk that answers, connects, and takes a message. Follow the
            conversation as it moves.
          </p>
        </div>
        <div className="heading-meta">
          <span className="outline-tag">
            <span className="tiny-dot" /> ENGLISH
          </span>
          <span>
            3 minute sessions
            <br />
            Synthetic company · simulated actions
          </span>
        </div>
      </div>
      <main className="workspace">
        {workflow ? (
          <StageRail
            workflow={workflow}
            active={active}
            pending={pending}
            visited={visited}
            selected={selected}
            select={setSelected}
          />
        ) : (
          <aside className="stage-rail loading-panel">
            <LoaderCircle size={18} className="spin" /> Loading workflow
          </aside>
        )}
        <section className="conversation-panel">
          <div className="panel-top">
            <div className="view-tabs">
              <button
                className={view === "conversation" ? "chosen" : ""}
                onClick={() => setView("conversation")}
              >
                <MessageSquare size={14} /> Conversation
              </button>
              <button
                className={view === "workflow" ? "chosen" : ""}
                onClick={() => setView("workflow")}
              >
                <GitBranch size={14} /> Flow
              </button>
            </div>
            <span className={`connection-state ${connected ? "online" : ""}`}>
              <span />
              {connected
                ? "Connected"
                : connecting
                  ? "Connecting"
                  : "Not connected"}
            </span>
          </div>
          {view === "workflow" && workflow ? (
            <WorkflowMap workflow={workflow} active={active} />
          ) : (
            <div className="chat-scroll" aria-live="polite">
              {!chats.length ? (
                <div className="empty-conversation">
                  <div className="front-desk-icon">
                    <Phone size={26} strokeWidth={1.3} />
                    <span className="icon-orbit" />
                  </div>
                  <span className="eyebrow">MEET JAMIE AT NORTHLINE</span>
                  <h2>
                    Let’s see where
                    <br />
                    the conversation goes.
                  </h2>
                  <p>
                    Ask about the company, reach a department,
                    <br />
                    or leave a message when someone’s away.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => setSettings(true)}
                  >
                    <Plus size={15} /> Start a conversation{" "}
                    <ArrowRight size={15} />
                  </button>
                  <div className="sample-prompts">
                    <span>OR TRY A STARTING POINT</span>
                    {examples.map((example) => (
                      <button
                        key={example}
                        onClick={() => {
                          setInput(example);
                          if (!connected) setSettings(true);
                        }}
                      >
                        {example}
                        <ArrowRight size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="messages">
                  {chats.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                      <div className="message-avatar">
                        {message.role === "assistant" ? "J" : "Y"}
                      </div>
                      <div>
                        <div className="message-label">
                          {message.role === "assistant" ? "Jamie" : "You"}
                          <span>
                            {message.interrupted
                              ? "Interrupted"
                              : message.role === "assistant"
                                ? "Northline reception"
                                : ""}
                          </span>
                        </div>
                        <p>{message.text}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottom} />
                </div>
              )}
            </div>
          )}
          {error ? (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button title="Dismiss error" onClick={() => setError("")}>
                <X size={13} />
              </button>
            </div>
          ) : null}
          <div className="session-controls">
            <div className={`voice-indicator ${mic ? "listening" : ""}`}>
              <AudioLines
                size={17}
                style={{ opacity: mic ? 0.45 + level * 0.55 : 0.4 }}
              />
              <span>{phase}</span>
            </div>
            <div className="session-buttons">
              {connected ? (
                <>
                  <span
                    className={`countdown ${remaining < 30 ? "urgent" : ""}`}
                  >
                    {minutes}
                  </span>
                  {mode === "voice" ? (
                    <button
                      title={mic ? "Mute microphone" : "Enable microphone"}
                      className={`icon-button ${mic ? "mic-active" : ""}`}
                      onClick={() => {
                        if (mic) {
                          audio.current.stopMicrophone();
                          setMic(false);
                        } else void enableMicrophone();
                      }}
                    >
                      {mic ? <Mic size={15} /> : <MicOff size={15} />}
                    </button>
                  ) : null}
                  <button
                    className="icon-button"
                    title="Interrupt response"
                    onClick={stop}
                  >
                    <Square size={13} />
                  </button>
                  <button className="end-button" onClick={end}>
                    End session
                  </button>
                </>
              ) : (
                <button className="text-link" onClick={() => setSettings(true)}>
                  Connect <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>
          <form className="composer" onSubmit={send}>
            <input
              aria-label="Message to Jamie"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                connected
                  ? "Type a message to Jamie…"
                  : "Connect to begin, or enter a starting question…"
              }
              maxLength={8000}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!input.trim()}
            >
              <Send size={17} />
            </button>
          </form>
          <div className="composer-note">
            <span>
              <KeyRound size={10} /> Session-only keys. No database.
            </span>
            <button onClick={download} disabled={!chats.length}>
              <Download size={11} /> Export session
            </button>
          </div>
        </section>
        <aside className="inspector">
          <div className="inspector-heading">
            <span className="section-label">
              <Radio size={13} /> UNDER THE HOOD
            </span>
            <span className="live-label">{connected ? "LIVE" : "PREVIEW"}</span>
          </div>
          <div className="inspector-tabs">
            {(["state", "sources", "trace"] as const).map((tab) => (
              <button
                className={inspector === tab ? "chosen" : ""}
                onClick={() => setInspector(tab)}
                key={tab}
              >
                {pretty(tab)}
                {tab === "sources" && sources.length ? (
                  <span>{sources.length}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="inspector-content">
            {inspector === "state" ? (
              <>
                <div className="metric-card">
                  <div className="metric-title">
                    Estimated voice response gap <Volume2 size={13} />
                  </div>
                  <div className="metric-value">
                    {gap === null ? (
                      <span className="metric-empty">—</span>
                    ) : (
                      (gap / 1000).toFixed(2)
                    )}
                    {gap !== null ? <small>s</small> : null}
                  </div>
                  <p>
                    {gap === null
                      ? "Appears after real voice playback."
                      : "Browser voice-activity estimate; not a benchmark."}
                  </p>
                  <div className="target-line">
                    <span /> Target 1.0–1.2s · flag over 1.5s
                  </div>
                </div>
                <div className="inspector-block">
                  <div className="section-label">ACTIVE STAGE</div>
                  <div className="active-stage-name">
                    <span className="tiny-dot" />
                    {workflow?.nodes[active]?.title || pretty(active)}
                  </div>
                  {pending ? (
                    <div className="pending-note">
                      <ArrowRight size={12} /> Pending:{" "}
                      {workflow?.nodes[pending]?.title}
                    </div>
                  ) : null}
                  <p className="help-copy">
                    Speaking keeps its stage snapshot. Routing evaluates
                    alongside it.
                  </p>
                </div>
                <div className="inspector-block">
                  <div className="section-label">
                    RECORDED FACTS <span>{Object.keys(facts).length}</span>
                  </div>
                  {Object.keys(facts).length ? (
                    Object.entries(facts).map(([key, fact]) => (
                      <details className="fact-row" key={key}>
                        <summary>
                          <span>{pretty(key)}</span>
                          <strong>
                            {fact.value === true
                              ? "Confirmed"
                              : fact.value === false
                                ? "No"
                                : fact.value || fact.status}
                          </strong>
                        </summary>
                        <p>Evidence: “{fact.evidence}”</p>
                      </details>
                    ))
                  ) : (
                    <div className="empty-facts">
                      <span />
                      <span />
                      <span />
                      <p>Details appear as the conversation unfolds.</p>
                    </div>
                  )}
                </div>
                <details className="stage-detail">
                  <summary>
                    <Code2 size={13} /> Inspect {inspected?.title || "stage"}
                    <ChevronDown size={12} />
                  </summary>
                  <p>{inspected?.prompt || "End of the conversation."}</p>
                  <div className="capability-tag">
                    {inspected?.tool ||
                      (inspected?.tools.length
                        ? inspected.tools.join(", ")
                        : "Conversation + public knowledge")}
                  </div>
                </details>
                {receipts.length ? (
                  <div className="inspector-block">
                    <div className="section-label">ACTION RECEIPTS</div>
                    {receipts.map((receipt, i) => (
                      <div className="receipt" key={i}>
                        <Check size={13} />
                        <span>
                          {pretty(receipt.tool)}
                          <strong>{receipt.status}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : inspector === "sources" ? (
              <>
                <div className="inspector-intro">
                  <h3>Answers with a source.</h3>
                  <p>
                    Local document search runs alongside turn handling. It never
                    waits for an FAQ classifier.
                  </p>
                </div>
                {sources.length ? (
                  sources.map((source) => (
                    <article className="source-card" key={source.chunk_id}>
                      <div>
                        {source.document}
                        <span>{source.score?.toFixed(2)}</span>
                      </div>
                      <h4>{source.heading}</h4>
                      <p>{source.text}</p>
                    </article>
                  ))
                ) : (
                  <div className="empty-inspector">
                    <Code2 size={25} />
                    <p>
                      Ask a company question to see the retrieved passages here.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="inspector-intro">
                  <h3>The conversation, explained.</h3>
                  <p>
                    State changes, evaluation, tool results, and provider
                    events. Times are relative to the session.
                  </p>
                </div>
                {trace.length ? (
                  trace.map((event, i) => (
                    <details className="trace-row" key={i}>
                      <summary>
                        <span>{event.at.toFixed(2)}s</span>
                        {pretty(event.type)}
                      </summary>
                      <pre>
                        {JSON.stringify(safeExport(event.data), null, 2)}
                      </pre>
                    </details>
                  ))
                ) : (
                  <div className="empty-inspector">
                    <Terminal size={24} />
                    <p>Events will appear when you connect.</p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="inspector-footer">
            <span className="tiny-dot" /> Explicit stages. Natural conversation.
          </div>
        </aside>
      </main>
      <footer className="page-footer">
        <span>
          <span className="footer-mark">l.</span> A small experiment in making
          voice agents follow a score.
        </span>
        <span>
          YAML → runtime → conversation <ArrowRight size={12} />
        </span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => setSettings(false)}
        onClose={() => setSettings(false)}
        className="connection-dialog"
      >
        <div className="dialog-top">
          <span className="eyebrow">MAKE A CONNECTION</span>
          <button
            className="icon-button"
            onClick={() => setSettings(false)}
            title="Close connection settings"
          >
            <X size={18} />
          </button>
        </div>
        <h2>
          {connected ? "Your connection." : "Give the front desk a ring."}
        </h2>
        <p className="dialog-description">
          Use the hosted demo budget when available, or bring your own keys.
          Keys are used only for this session.
        </p>
        <div className="mode-switch">
          <button
            disabled={connected}
            className={mode === "voice" ? "chosen" : ""}
            onClick={() => setMode("voice")}
          >
            <Mic size={15} /> Live voice
          </button>
          <button
            disabled={connected}
            className={mode === "text" ? "chosen" : ""}
            onClick={() => setMode("text")}
          >
            <MessageSquare size={15} /> Text
          </button>
        </div>
        <label className="field-label">
          OpenRouter key{" "}
          <span>
            {credentials.openrouter === "hosted"
              ? "Hosted budget available"
              : credentials.openrouter === "visitor"
                ? "Using your key"
                : "Required for conversation"}
          </span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={orKey}
            onChange={(e) => setOrKey(e.target.value)}
            placeholder="Optional if hosted budget is available"
            maxLength={1024}
          />
        </label>
        {mode === "voice" ? (
          <label className="field-label">
            Deepgram key{" "}
            <span>
              {credentials.deepgram === "hosted"
                ? "Hosted budget available"
                : credentials.deepgram === "visitor"
                  ? "Using your key"
                  : "Required for live speech"}
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={dgKey}
              onChange={(e) => setDgKey(e.target.value)}
              placeholder="For Flux listening and speaking"
              maxLength={1024}
            />
          </label>
        ) : null}
        <details className="advanced-settings">
          <summary>
            Demo settings <ChevronDown size={13} />
          </summary>
          <label className="field-label">
            Simulated transfer outcome
            <select
              disabled={connected}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option value="unavailable">
                Person unavailable → offer a message
              </option>
              <option value="connected">Transfer connected</option>
              <option value="failed">Transfer failed</option>
              <option value="timeout">Transfer timed out</option>
            </select>
          </label>
          <label className="field-label">
            Speaking model
            <input
              value={speakerModel}
              onChange={(e) => setSpeakerModel(e.target.value)}
              placeholder={workflow?.models.speaker}
              disabled={connected}
            />
          </label>
          <label className="field-label">
            Evaluator model
            <input
              value={evaluatorModel}
              onChange={(e) => setEvaluatorModel(e.target.value)}
              placeholder={workflow?.models.evaluator}
              disabled={connected}
            />
          </label>
        </details>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="primary-button dialog-connect"
          onClick={() => void connect()}
          disabled={connecting}
        >
          {connecting ? (
            <LoaderCircle size={16} className="spin" />
          ) : connected ? (
            <KeyRound size={16} />
          ) : (
            <Phone size={16} />
          )}{" "}
          {connecting
            ? "Connecting…"
            : connected
              ? "Apply session keys"
              : "Start conversation"}
          <ArrowRight size={16} />
        </button>
        <div className="dialog-footnote">
          English · 3 minute limit · mock transfers and messages
        </div>
      </dialog>
    </div>
  );
}
