import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AudioLines,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Download,
  FileCode2,
  FileText,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  PanelRightClose,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { AgentEditor } from "./AgentEditor";
import { readWorkflow, type Workflow } from "./workflow";
import { SessionClient, safeExport, type EventPacket } from "./client";
import { decodeAudioFrame, VoiceAudio } from "./audio";

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
  knowledge_documents: { document: string; heading: string; text: string }[];
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
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState("unavailable");
  const [active, setActive] = useState("identify");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState("identify");
  const [facts, setFacts] = useState<Record<string, Fact>>({});
  const [sources, setSources] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [input, setInput] = useState("");
  const [view, setView] = useState("agent");
  const [source, setSource] = useState("");
  const [originalSource, setOriginalSource] = useState("");
  const [validatedSource, setValidatedSource] = useState("");
  const [validating, setValidating] = useState(false);
  const [yamlIssues, setYamlIssues] = useState<string[]>([]);
  const [showTest, setShowTest] = useState(true);
  const [testTab, setTestTab] = useState("conversation");
  const [runningWorkflow, setRunningWorkflow] = useState<Workflow | null>(null);
  const [trace, setTrace] = useState<EventPacket[]>([]);
  const [remaining, setRemaining] = useState(180);
  const [gap, setGap] = useState<number | null>(null);
  const [mic, setMic] = useState(false);
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
      setRunningWorkflow(d.workflow);
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
    } else if (event.type === "turn") {
      setPhase(d.speculative ? "Preparing a reply" : "Thinking");
      if (!d.speculative) upsertUser(d.turn_id, d.text);
    } else if (event.type === "transcript") {
      upsertUser(d.turn_id, d.text);
      lastInputAt.current = audio.current.lastVoiceAt || performance.now();
    } else if (event.type === "retrieval") setSources(d.passages);
    else if (event.type === "first_text")
      activeReply.current =
        d.message_id || `${d.turn_id}-${event.epoch}-${event.at}`;
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
        audio.current.finish(d.epoch, d.speech_id);
    } else if (event.type === "speech_interrupted") {
      const spoken = d.text_spoken;
      if (typeof spoken === "string")
        setChats((old) =>
          old.map((m) =>
            m.id === d.message_id
              ? { ...m, text: spoken, interrupted: true }
              : m,
          ),
        );
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
        setPhase("Not connected");
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
      void audio.current.close();
      client.current?.close();
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
    fetch("/api/workflow.yaml", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then((text) => {
        setSource(text);
        setOriginalSource(text);
        setValidatedSource(text);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("Could not load the YAML definition.");
      });
    client.current = new SessionClient(
      (e) => handleRef.current(e),
      (buffer) => {
        if (!ready.current) return;
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
    audio.current.onProgress = (ms, drained, epoch, speechId) => {
      if (!ready.current) return;
      client.current?.send({
        type: "playback",
        playback_ms: ms,
        drained,
        epoch,
        speech_id: speechId,
      });
      if (drained) setPhase("Listening");
      if (firstAudioEpoch.current === epoch && lastInputAt.current) {
        setGap(performance.now() - lastInputAt.current);
        firstAudioEpoch.current = -2;
        lastInputAt.current = 0;
      }
    };
    audio.current.onError = (message) => {
      setError(message);
      stop();
    };
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
      if (ready.current) setMic(true);
      else audio.current.stopMicrophone();
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
      if (!(await validateSource())) {
        setSettings(false);
        return;
      }
      await audio.current.close();
      audio.current.beginSession();
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
      client.current?.connect({
        mode,
        openrouter_key: orKey,
        deepgram_key: dgKey,
        transfer_outcome: outcome,
        workflow_yaml: source,
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
    lastInputAt.current = 0;
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
  async function validateSource(): Promise<boolean> {
    setValidating(true);
    try {
      const response = await fetch("/api/workflow/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const result = await response.json();
      if (!response.ok) {
        const issues = Array.isArray(result.detail)
          ? result.detail.map(
              (issue: any) =>
                `${issue.path || (issue.loc || []).join(".")}: ${issue.message || issue.msg}`,
            )
          : ["The workflow is invalid."];
        setYamlIssues(issues);
        setView("yaml");
        return false;
      }
      setValidatedSource(source);
      setYamlIssues([]);
      return true;
    } catch {
      setYamlIssues([
        "The backend is unavailable. Your edits are still in this tab.",
      ]);
      return false;
    } finally {
      setValidating(false);
    }
  }
  function downloadYaml() {
    const url = URL.createObjectURL(
      new Blob([source], { type: "application/yaml" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent.yaml";
    a.click();
    URL.revokeObjectURL(url);
  }
  const workflow = readWorkflow(source) || config?.workflow;
  const liveWorkflow = runningWorkflow || workflow;
  const minutes = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <div className={`studio ${showTest ? "with-test" : ""}`}>
      <aside className="app-sidebar">
        <a href="/" className="studio-brand">
          <span className="brand-bars">
            <i />
            <i />
          </span>
          libretto
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">P</span>
          <span>
            Personal workspace<small>Voice agents</small>
          </span>
          <ChevronDown size={13} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          <button
            className={view !== "knowledge" ? "active" : ""}
            onClick={() => setView("agent")}
          >
            <AudioLines size={17} /> Agents <span>1</span>
          </button>
          <button
            className={view === "knowledge" ? "active" : ""}
            onClick={() => setView("knowledge")}
          >
            <BookOpen size={17} /> Knowledge base
          </button>
          <button onClick={() => setView("yaml")}>
            <Braces size={17} /> YAML definition
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-label">
            <ShieldCheck size={15} />
            <span>
              Demo workspace<small>Simulated actions · no database</small>
            </span>
          </div>
          <button onClick={() => setSettings(true)}>
            <KeyRound size={15} /> API connection <Settings2 size={13} />
          </button>
          <div className="sidebar-footer">
            Libretto <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="studio-main">
        <div className="breadcrumb">
          <button onClick={() => setView("agent")}>
            <ArrowLeft size={13} /> Agents
          </button>
          <span>/</span>
          <span>{workflow?.name || "Receptionist"}</span>
          <span className="breadcrumb-right">
            English · Session memory only
          </span>
        </div>
        <header className="agent-header">
          <div className="agent-identity">
            <div className="agent-avatar">
              <AudioLines size={23} />
            </div>
            <div>
              <div className="agent-title">
                <h1>{workflow?.name || "Northline front desk"}</h1>
                <span className="badge">Draft</span>
              </div>
              <p>
                A receptionist that answers questions, connects callers, and
                takes messages.
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="button"
              onClick={downloadYaml}
              title="Download YAML"
            >
              <Download size={14} />
              <span>Export YAML</span>
            </button>
            <button
              className="button black"
              onClick={() => setShowTest(!showTest)}
            >
              <Play size={13} fill="currentColor" />
              {showTest ? "Hide test" : "Test agent"}
            </button>
          </div>
        </header>
        <div className="agent-tabs">
          <div role="tablist" aria-label="Agent settings">
            {[
              { id: "agent", label: "Agent" },
              { id: "yaml", label: "YAML" },
              { id: "knowledge", label: "Knowledge base" },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={view === t.id}
                className={view === t.id ? "selected" : ""}
                onClick={() => setView(t.id)}
              >
                {t.label}
                {t.id === "yaml" && source !== validatedSource && <i />}
              </button>
            ))}
          </div>
          <span
            className={
              source === validatedSource ? "save-status" : "save-status unsaved"
            }
          >
            {source === validatedSource ? (
              <>
                <Check size={12} /> Validated
              </>
            ) : (
              "Unsaved changes"
            )}
          </span>
          <button
            className="button apply-button"
            onClick={() => void validateSource()}
            disabled={validating || !source}
          >
            {validating ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <Check size={13} />
            )}
            Apply changes
          </button>
        </div>
        <div className="editor-layout">
          <main className="definition-panel">
            {source ? (
              <AgentEditor
                source={source}
                onChange={(value) => {
                  setSource(value);
                  setYamlIssues([]);
                }}
                tab={view}
                validated={source === validatedSource}
                validating={validating}
                issues={yamlIssues}
                onValidate={() => void validateSource()}
                documents={config?.knowledge_documents || []}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <div className="loading-state">
                <LoaderCircle className="spin" size={18} />
                Loading agent…
              </div>
            )}
            <div className="definition-footer">
              <span>
                <ShieldCheck size={12} /> Changes stay in this tab and apply to
                the next test.
              </span>
              <button
                onClick={() => {
                  setSource(originalSource);
                  setYamlIssues([]);
                }}
                disabled={source === originalSource}
              >
                <RotateCcw size={12} /> Reset example
              </button>
            </div>
          </main>
          {showTest && (
            <aside className="test-panel">
              <div className="test-heading">
                <span>
                  <Radio size={15} /> Test your agent
                </span>
                <button
                  title="Close test panel"
                  onClick={() => setShowTest(false)}
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
              <div className="test-options">
                <div className="mode-switch">
                  <button
                    disabled={connected}
                    className={mode === "voice" ? "chosen" : ""}
                    onClick={() => setMode("voice")}
                  >
                    <Mic size={13} />
                    Voice
                  </button>
                  <button
                    disabled={connected}
                    className={mode === "text" ? "chosen" : ""}
                    onClick={() => setMode("text")}
                  >
                    <MessageSquare size={13} />
                    Text
                  </button>
                </div>
                <button
                  title="Connection settings"
                  onClick={() => setSettings(true)}
                >
                  <Settings2 size={15} />
                </button>
              </div>
              <div className="test-tabs">
                {["conversation", "state", "sources", "trace"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTestTab(t)}
                    className={testTab === t ? "selected" : ""}
                  >
                    {pretty(t)}
                  </button>
                ))}
              </div>
              {testTab === "conversation" ? (
                <div className="chat-scroll" aria-live="polite">
                  {!chats.length ? (
                    <div className="test-empty">
                      <div
                        className={`voice-orb ${connected ? "orb-live" : ""}`}
                      >
                        <div />
                        <AudioLines size={35} strokeWidth={1.3} />
                      </div>
                      <h2>
                        {connected
                          ? "Your agent is listening"
                          : "Try a conversation"}
                      </h2>
                      <p>
                        {connected
                          ? "Speak or type a message to begin."
                          : "Test your agent’s voice, instructions, and workflow before sharing it."}
                      </p>
                      <button
                        className="button black"
                        disabled={connecting || connected}
                        onClick={() => setSettings(true)}
                      >
                        {connecting ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <Play size={13} fill="currentColor" />
                        )}
                        {connecting
                          ? "Connecting…"
                          : connected
                            ? "Connected"
                            : "Start test"}
                      </button>
                      <div className="test-suggestions">
                        <span>TRY ASKING</span>
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
                        <div
                          key={message.id}
                          className={`message ${message.role}`}
                        >
                          <div className="message-label">
                            {message.role === "assistant" ? "Agent" : "You"}
                            {message.interrupted && (
                              <span>
                                Interrupted · generated text may be unplayed
                              </span>
                            )}
                          </div>
                          <p>{message.text}</p>
                        </div>
                      ))}
                      <div ref={bottom} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="test-inspector">
                  {testTab === "state" ? (
                    <>
                      <div className="live-stage">
                        <span className="tiny-dot" />
                        <div>
                          <small>Active stage</small>
                          <strong>
                            {liveWorkflow?.nodes[active]?.title ||
                              pretty(active)}
                          </strong>
                          {pending && (
                            <small>
                              Pending:{" "}
                              {liveWorkflow?.nodes[pending]?.title || pending}
                            </small>
                          )}
                        </div>
                        <span className="badge">
                          {connected ? "Live" : "Preview"}
                        </span>
                      </div>
                      <div className="gap-card">
                        <span>Estimated response gap</span>
                        <strong>
                          {gap === null ? "—" : `${(gap / 1000).toFixed(2)}s`}
                        </strong>
                        <small>
                          Voice-activity estimate, not a latency benchmark.
                        </small>
                      </div>
                      <h3>
                        Collected facts <span>{Object.keys(facts).length}</span>
                      </h3>
                      {Object.entries(facts).length ? (
                        Object.entries(facts).map(([key, fact]) => (
                          <details className="fact-row" key={key}>
                            <summary>
                              <span>{pretty(key)}</span>
                              <strong>
                                {String(fact.value ?? fact.status)}
                              </strong>
                            </summary>
                            <p>{fact.evidence}</p>
                          </details>
                        ))
                      ) : (
                        <p className="empty-copy">
                          Extracted details appear during a conversation.
                        </p>
                      )}
                      {receipts.length > 0 && (
                        <>
                          <h3>Action receipts</h3>
                          {receipts.map((r, i) => (
                            <div className="receipt" key={i}>
                              <Check size={13} />
                              {pretty(r.tool)}
                              <span className="badge">{r.status}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  ) : testTab === "sources" ? (
                    <>
                      <h3>Retrieved passages</h3>
                      <p className="empty-copy">
                        Document search runs on every nonempty turn.
                      </p>
                      {sources.length ? (
                        sources.map((source) => (
                          <article
                            className="source-card"
                            key={source.chunk_id}
                          >
                            <span>
                              <FileText size={12} />
                              {source.document}
                            </span>
                            <h4>{source.heading}</h4>
                            <p>{source.text}</p>
                          </article>
                        ))
                      ) : (
                        <p className="empty-copy">
                          Ask a company question to see its sources.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <h3>Session events</h3>
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
                        <p className="empty-copy">
                          Events appear when you connect.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {error && (
                <div className="error-banner" role="alert">
                  <span>{error}</span>
                  <button title="Dismiss error" onClick={() => setError("")}>
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="test-session-status">
                <span className={connected ? "status-online" : ""}>
                  <i />
                  {phase}
                </span>
                {connected ? (
                  <div>
                    <span>{minutes}</span>
                    {mode === "voice" && (
                      <button
                        title={mic ? "Mute microphone" : "Enable microphone"}
                        onClick={() => {
                          if (mic) {
                            audio.current.stopMicrophone();
                            setMic(false);
                          } else void enableMicrophone();
                        }}
                      >
                        {mic ? <Mic size={14} /> : <MicOff size={14} />}
                      </button>
                    )}
                    <button title="Interrupt response" onClick={stop}>
                      <Square size={12} />
                    </button>
                    <button className="end-button" onClick={end}>
                      End
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setSettings(true)}>
                    <KeyRound size={12} /> Connect
                  </button>
                )}
              </div>
              <form className="composer" onSubmit={send}>
                <input
                  aria-label="Message to agent"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    connected ? "Type a message…" : "Enter a test message…"
                  }
                  maxLength={8000}
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!input.trim()}
                >
                  <ArrowRight size={17} />
                </button>
              </form>
              <div className="test-footer">
                <span>3 minute limit · simulated actions</span>
                <button
                  onClick={download}
                  disabled={!chats.length}
                  title="Export session"
                >
                  <Download size={12} />
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
      <dialog
        ref={dialog}
        onCancel={() => setSettings(false)}
        onClose={() => setSettings(false)}
        className="connection-dialog"
      >
        <div className="dialog-top">
          <span className="dialog-icon">
            <KeyRound size={18} />
          </span>
          <button
            title="Close connection settings"
            onClick={() => setSettings(false)}
          >
            <X size={18} />
          </button>
        </div>
        <h2>{connected ? "Session connection" : "Connect your agent"}</h2>
        <p>
          Use the hosted budget when available, or enter your own provider keys.
          Keys stay in this session.
        </p>
        <div className="mode-switch">
          <button
            disabled={connected}
            className={mode === "voice" ? "chosen" : ""}
            onClick={() => setMode("voice")}
          >
            <Mic size={14} /> Live voice
          </button>
          <button
            disabled={connected}
            className={mode === "text" ? "chosen" : ""}
            onClick={() => setMode("text")}
          >
            <MessageSquare size={14} /> Text only
          </button>
        </div>
        <label className="input-label">
          OpenRouter API key
          <span className="field-help">
            {credentials.openrouter === "hosted"
              ? "Hosted budget available"
              : credentials.openrouter === "visitor"
                ? "Using your session key"
                : "Required for conversation"}
          </span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={orKey}
            onChange={(e) => setOrKey(e.target.value)}
            placeholder="sk-or-…"
            maxLength={1024}
          />
        </label>
        {mode === "voice" && (
          <label className="input-label">
            Deepgram API key
            <span className="field-help">
              {credentials.deepgram === "hosted"
                ? "Hosted speech budget available"
                : "Required for live speech"}
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={dgKey}
              onChange={(e) => setDgKey(e.target.value)}
              placeholder="Your Deepgram API key"
              maxLength={1024}
            />
          </label>
        )}
        <label className="input-label">
          Simulated transfer outcome
          <select
            disabled={connected}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="unavailable">
              Person unavailable → take a message
            </option>
            <option value="connected">Transfer connected</option>
            <option value="failed">Transfer failed</option>
            <option value="timeout">Transfer timed out</option>
          </select>
        </label>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {yamlIssues.length > 0 && (
          <div className="error-banner" role="alert">
            Fix the YAML definition before starting a test.
          </div>
        )}
        <button
          className="button black dialog-connect"
          onClick={() => void connect()}
          disabled={connecting || validating}
        >
          {connecting || validating ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
          {connecting
            ? "Connecting…"
            : validating
              ? "Validating YAML…"
              : connected
                ? "Update session keys"
                : "Start test"}
        </button>
        <div className="dialog-footnote">
          <ShieldCheck size={12} /> Session-only credentials · no browser
          storage
        </div>
      </dialog>
    </div>
  );
}
