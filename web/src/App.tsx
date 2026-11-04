import { Select } from "./ui/Select";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AudioLines,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ClipboardList,
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
import { VoiceCredentials, type VoiceKeys } from "./VoiceCredentials";
import { YamlWorkspace } from "./studio/YamlWorkspace";
import { ExportDialog } from "./studio/ExportDialog";
import { describeRoutes } from "./studio/graph-model";
import { parseIssues } from "./studio/changes";
import { StudioShell } from "./studio/StudioShell";
import type { ToolManifest } from "./studio/tool-manifest";
import { SourcesPage } from "./studio/SourcesPage";
import type { StudioCapabilities } from "./studio/runtime-api";
import { SettingsPage } from "./studio/SettingsPage";
import { TestPanel } from "./studio/TestPanel";
import {
  TestScenarios,
  prepareScenario,
  type TestScenario,
} from "./TestScenarios";
import { readWorkflow, type Workflow } from "./workflow";
import { createDocument, documentReducer } from "./studio/document-store";
import {
  buildExportFiles,
  documentStatus,
  DRAFT_STORAGE_KEY,
  DEVICE_STORAGE_KEY,
  openProjectFiles,
  restoreDraft,
  serializeDraft,
} from "./studio/project-files";
import type {
  DocumentAction,
  StudioDocument,
  WorkflowIssue,
} from "./studio/types";
import { SessionClient, safeExport, type EventPacket } from "./client";
import { decodeAudioFrame, VoiceAudio } from "./audio";
import { TurnTimings } from "./timing";
import { VoiceCall, VoiceOrb } from "./VoiceCall";

import { updateDelivery, retainEvent, type Chat } from "./conversation";

const WorkflowGraph = lazy(() => import("./WorkflowGraph"));

type Fact = {
  value: string | boolean | null;
  status: string;
  evidence: string;
};
type Config = {
  workflow: Workflow;
  credentials: Record<string, string>;
  call_limit_seconds: number;
  credential_mode: "visitor" | "hosted";
  test_scenarios: TestScenario[];
  knowledge_documents: { document: string; heading: string; text: string }[];
};
const examples = [
  "How much is a day pass?",
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
  const [voiceKeys, setVoiceKeys] = useState<VoiceKeys>({});
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState("unavailable");
  const [active, setActive] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [facts, setFacts] = useState<Record<string, Fact>>({});
  const [sources, setSources] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [input, setInput] = useState("");
  const [view, setView] = useState("workflow");
  const [studioDocument, setDocument] = useState(() => {
    try {
      const restored = restoreDraft(
        localStorage.getItem(DRAFT_STORAGE_KEY) || "",
      );
      if (restored) return restored;
    } catch {
      /* Storage may be disabled. Editing remains available. */
    }
    return createDocument("agent.yaml", new Uint8Array());
  });
  const openInput = useRef<HTMLInputElement>(null);
  const [fileNotices, setFileNotices] = useState<string[]>([]);
  const [toolManifests, setToolManifests] = useState<ToolManifest[]>([]);
  const [capabilities, setCapabilities] = useState<StudioCapabilities | null>(
    null,
  );
  const [exportOpen, setExportOpen] = useState(false);
  const documentRef = useRef(studioDocument);
  const validationRequest = useRef(1);
  const autoValidationTimer = useRef<number | undefined>(undefined);
  function replaceDocument(next: StudioDocument) {
    documentRef.current = next;
    setDocument(next);
  }
  function dispatchDocument(action: DocumentAction) {
    replaceDocument(documentReducer(documentRef.current, action));
  }
  const {
    source,
    importedSource: originalSource,
    past: history,
  } = studioDocument;
  const validatedSource = studioDocument.lastValid?.source ?? "";
  const validating = studioDocument.validation.state === "pending";
  const yamlIssues =
    studioDocument.validation.state === "unavailable"
      ? ["The backend is unavailable. Your edits are still in this tab."]
      : studioDocument.validation.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );
  const [showTest, setShowTest] = useState(false);
  function changeSource(value: string, historyGroup?: string) {
    dispatchDocument({ type: "raw-source", source: value, historyGroup });
  }
  function undoSource() {
    dispatchDocument({ type: "undo" });
  }
  const [testTab, setTestTab] = useState("conversation");
  const [activeScenario, setActiveScenario] = useState<TestScenario | null>(
    null,
  );
  const [scenarioStep, setScenarioStep] = useState(0);
  const [runningWorkflow, setRunningWorkflow] = useState<Workflow | null>(null);
  const [trace, setTrace] = useState<EventPacket[]>([]);
  const [remaining, setRemaining] = useState(300);
  const [gap, setGap] = useState<number | null>(null);
  const [mic, setMic] = useState(false);
  const orbRef = useRef<HTMLDivElement>(null);
  const client = useRef<SessionClient | null>(null);
  const audio = useRef(new VoiceAudio());
  const deadline = useRef(0);
  const traceRef = useRef<EventPacket[]>([]);
  const activeReply = useRef("");
  const timings = useRef(new TurnTimings());
  const replyKinds = useRef(new Map<string, string>());
  const sessionClockBase = useRef(0);
  const [timingSummary, setTimingSummary] = useState<
    ReturnType<TurnTimings["export"]>["summary"] | null
  >(null);
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
    if (retainEvent(event))
      traceRef.current = [...traceRef.current.slice(-499), event];
    if (
      [
        "interrupted",
        "speech_interrupted",
        "playback",
        "expired",
        "ended",
        "call_closed",
      ].includes(event.type)
    )
      setChats((old) => updateDelivery(old, event));
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
      setVoiceKeys({});
      sessionClockBase.current = performance.now() - event.at * 1000;
      deadline.current = sessionClockBase.current + d.call_limit_seconds * 1000;
      if (d.mode === "voice") void enableMicrophone();
    } else if (event.type === "state") {
      setActive(d.active_stage);
      setPending(d.pending_stage);
      setFacts(d.facts);
      setReceipts(d.receipts);
    } else if (event.type === "turn") {
      setPhase(d.speculative ? "Preparing a reply" : "Thinking");
      if (!d.speculative) {
        upsertUser(d.turn_id, d.text);
        timings.current.confirm(
          event.epoch,
          d.turn_id,
          performance.now(),
          null,
        );
      }
    } else if (event.type === "transcript") {
      upsertUser(d.turn_id, d.text);
      timings.current.confirm(
        event.epoch,
        d.turn_id,
        performance.now(),
        mode === "voice" ? audio.current.lastVoiceAt || null : null,
      );
      setTimingSummary(timings.current.export().summary);
    } else if (event.type === "retrieval") {
      setSources(d.passages);
      timings.current.retrieval(event.epoch, d.turn_id, d.duration_ms);
      setTimingSummary(timings.current.export().summary);
    } else if (event.type === "first_text") {
      activeReply.current =
        d.message_id || `${d.turn_id}-${event.epoch}-${event.at}`;
      replyKinds.current.set(activeReply.current, d.response_kind || "reply");
    } else if (event.type === "speech_started") {
      timings.current.bind(
        d.speech_id,
        d.message_id,
        event.epoch,
        replyKinds.current.get(d.message_id) || "reply",
      );
    } else if (event.type === "text_delta") {
      setPhase("Responding");
      const id = activeReply.current || `${d.turn_id}-${event.epoch}`;
      setChats((old) => {
        const found = old.find((m) => m.id === id);
        return found
          ? old.map((m) => (m.id === id ? { ...m, text: m.text + d.text } : m))
          : [...old, { id, role: "assistant", text: d.text }];
      });
    } else if (event.type === "response_done") {
      if (mode === "text") {
        setPhase("Listening");
        setChats((old) =>
          old.map((m) =>
            m.id === d.message_id ? { ...m, delivered: true } : m,
          ),
        );
      }
    } else if (event.type === "speech_finished") {
      if (d.epoch === client.current?.gate.current)
        audio.current.finish(d.epoch, d.speech_id);
    } else if (event.type === "interrupted") {
      audio.current.interrupt(event.epoch);
      setPhase("Listening");
    } else if (event.type === "error" || event.type === "speech_error") {
      setError(d.message || "The provider could not complete this request.");
      setConnecting(false);
      if (!ready.current) {
        dispatchDocument({ type: "test-stop" });
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
          "missing_livekit_api_key",
          "missing_livekit_api_secret",
          "missing_assemblyai_key",
          "missing_cartesia_key",
        ].includes(d.code)
      )
        setSettings(true);
    } else if (event.type === "expired" || event.type === "ended") {
      dispatchDocument({ type: "test-stop" });
      setPhase(
        event.type === "expired"
          ? "Session complete · 5 minute limit"
          : "Conversation complete",
      );
      ready.current = false;
      setConnected(false);
      setMic(false);
      setOrKey("");
      setVoiceKeys({});
      void audio.current.close();
      client.current?.close();
    } else if (event.type === "credentials_updated") {
      setCredentials(d.credentials);
      setSettings(false);
      setOrKey("");
      setVoiceKeys({});
      setError("");
    }
  }
  handleRef.current = handleEvent;

  useEffect(() => {
    const controller = new AbortController();
    const capabilitiesRequest = fetch("/api/studio/capabilities", {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.tools)) {
          setToolManifests(data.tools);
          setCapabilities(data);
        }
        return data as StudioCapabilities | null;
      })
      .catch(() => null);
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
        return r.arrayBuffer();
      })
      .then(async (buffer) => {
        const runtime = await capabilitiesRequest;
        if (documentRef.current.source || controller.signal.aborted) return;
        let next = createDocument(
          runtime?.workflowFilename || "agent.yaml",
          new Uint8Array(buffer),
        );
        const text = next.source;
        next = documentReducer(next, {
          type: "validation-start",
          requestId: 1,
          revision: 0,
        });
        next = documentReducer(next, {
          type: "validation-result",
          requestId: 1,
          revision: 0,
          source: text,
          workflow: readWorkflow(text),
          issues: [],
        });
        replaceDocument(next);
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
          timings.current.audio(frame.speechId, frame.epoch, performance.now());
          audio.current.push(frame);
        } catch {
          setError("An audio frame could not be played.");
        }
      },
      () => {
        setChats((old) =>
          updateDelivery(old, {
            type: "call_closed",
            epoch: 0,
            at: 0,
            data: {},
          }),
        );
        dispatchDocument({ type: "test-stop" });
        const wasReady = ready.current;
        ready.current = false;
        setConnected(false);
        setConnecting(false);
        setMic(false);
        void audio.current.close();
        setPhase((current) =>
          wasReady
            ? "Disconnected · start a fresh session"
            : current === "Connecting"
              ? "Connection ended · try again"
              : current,
        );
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
    };
    audio.current.onLevel = (level) => {
      orbRef.current?.style.setProperty(
        "--voice-scale",
        String(1 + level * 0.12),
      );
    };
    audio.current.onFirstPlayback = (speechId, epoch, at, method) => {
      if (!ready.current || epoch !== client.current?.gate.current) return;
      const result = timings.current.played(speechId, epoch, at, method);
      if (!result) return;
      setPhase("Speaking");
      if (result.kind === "reply") setGap(result.estimated_ttfs_ms);
      setTimingSummary(timings.current.export().summary);
      handleRef.current({
        type: "playback_started",
        epoch,
        at: (at - sessionClockBase.current) / 1000,
        data: { ...result, clock: "browser_performance_ms" },
      });
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
    if (!studioDocument.importedSource) return;
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, serializeDraft(studioDocument));
    } catch {
      /* Browser storage limits never block local editing/export. */
    }
  }, [studioDocument.source, studioDocument.metadata]);
  useEffect(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(DEVICE_STORAGE_KEY) || "null",
      );
      if (value?.version === 1 && ["voice", "text"].includes(value.mode))
        setMode(value.mode);
    } catch {
      /* Invalid device preferences are ignored. */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        DEVICE_STORAGE_KEY,
        JSON.stringify({ version: 1, mode }),
      );
    } catch {
      /* Device preferences are optional. */
    }
  }, [mode]);
  useEffect(() => {
    if (
      !source ||
      studioDocument.running ||
      studioDocument.validation.state === "valid"
    )
      return;
    autoValidationTimer.current = window.setTimeout(
      () => void validateSource(),
      650,
    );
    return () => window.clearTimeout(autoValidationTimer.current);
  }, [source]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.key.toLowerCase() !== "z"
      )
        return;
      event.preventDefault();
      dispatchDocument({ type: event.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
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
  const connectionAttempt = useRef(0);
  async function connect() {
    if (connected) {
      client.current?.send({
        type: "credentials",
        openrouter_key: orKey,
        ...voiceKeys,
      });
      return;
    }
    const attempt = ++connectionAttempt.current;
    try {
      if (!(await validateSource()) || attempt !== connectionAttempt.current) {
        setSettings(false);
        return;
      }
      const snapshot = documentRef.current.lastValid;
      if (!snapshot) return;
      dispatchDocument({ type: "test-start", snapshot });
      setConnecting(true);
      await audio.current.close();
      if (attempt !== connectionAttempt.current) return;
      audio.current.beginSession();
      if (mode === "voice") await audio.current.ensure();
      if (attempt !== connectionAttempt.current) {
        void audio.current.close();
        return;
      }
      setError("");
      setConnecting(true);
      setPhase("Connecting");
      setRemaining(config?.call_limit_seconds ?? 300);
      setGap(null);
      timings.current = new TurnTimings();
      replyKinds.current.clear();
      setTimingSummary(null);
      setChats([]);
      setFacts({});
      setSources([]);
      setReceipts([]);
      setTrace([]);
      traceRef.current = [];
      setActive(snapshot.workflow.start);
      client.current?.connect({
        mode,
        openrouter_key: orKey,
        ...voiceKeys,
        transfer_outcome: outcome,
        workflow_yaml: snapshot.source,
      });
    } catch {
      dispatchDocument({ type: "test-stop" });
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
    ++connectionAttempt.current;
    setConnecting(false);
    dispatchDocument({ type: "test-stop" });
    setChats((old) =>
      updateDelivery(old, { type: "call_closed", epoch: 0, at: 0, data: {} }),
    );
    client.current?.send({ type: "close" });
    client.current?.close();
    void audio.current.close();
    ready.current = false;
    setConnected(false);
    setMic(false);
    setPhase("Conversation ended");
    setOrKey("");
    setVoiceKeys({});
  }
  function download() {
    const content = safeExport({
      project: "Libretto",
      captured_at: new Date().toISOString(),
      messages: chats,
      receipts,
      events: traceRef.current,
      timings: timings.current.export(),
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
    window.clearTimeout(autoValidationTimer.current);
    const draft = documentRef.current;
    const requestId = ++validationRequest.current;
    dispatchDocument({
      type: "validation-start",
      requestId,
      revision: draft.revision,
    });
    try {
      const syntax = parseIssues(draft.source);
      if (syntax.length) {
        dispatchDocument({
          type: "validation-result",
          requestId,
          revision: draft.revision,
          source: draft.source,
          workflow: null,
          issues: syntax,
        });
        return false;
      }
      const response = await fetch("/api/workflow/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: draft.source }),
      });
      const result = await response.json();
      const issues: WorkflowIssue[] = response.ok
        ? []
        : Array.isArray(result.detail)
          ? result.detail.map((issue: any) => ({
              path: Array.isArray(issue.loc)
                ? issue.loc
                : typeof issue.path === "string"
                  ? issue.path.split(".")
                  : [],
              message: issue.message || issue.msg || "The workflow is invalid.",
              severity: "error",
            }))
          : [
              {
                path: [],
                message:
                  typeof result.detail === "string"
                    ? result.detail
                    : "The workflow is invalid.",
                severity: "error",
              },
            ];
      dispatchDocument({
        type: "validation-result",
        requestId,
        revision: draft.revision,
        source: draft.source,
        workflow: response.ok ? readWorkflow(draft.source) : null,
        issues,
      });
      const current = documentRef.current;
      if (
        current.revision !== draft.revision ||
        current.validation.requestId !== requestId
      )
        return false;
      if (!response.ok) setView("yaml");
      return current.validation.state === "valid";
    } catch {
      dispatchDocument({
        type: "validation-failure",
        requestId,
        revision: draft.revision,
      });
      return false;
    }
  }
  function prepareTest(scenario: TestScenario, step = 0) {
    if (connecting || (connected && activeScenario?.id !== scenario.id)) return;
    const draft = prepareScenario(scenario, step);
    if (!connected) setOutcome(draft.transferOutcome);
    setActiveScenario(scenario);
    setScenarioStep(draft.step);
    setInput(draft.input);
    setTestTab("conversation");
    setShowTest(true);
  }
  async function openFiles(files: FileList | null) {
    if (!files?.length || connected || connecting) return;
    try {
      const result = await openProjectFiles(Array.from(files));
      replaceDocument(result.document);
      setFileNotices(result.notices);
      const workflow = readWorkflow(result.document.source);
      setSelected("");
      setView("workflow");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not open files.",
      );
    } finally {
      if (openInput.current) openInput.current.value = "";
    }
  }
  const draftWorkflow = readWorkflow(source);
  let graphDraftValid =
    !!draftWorkflow && studioDocument.validation.state !== "invalid";
  if (graphDraftValid)
    try {
      describeRoutes(draftWorkflow!);
    } catch {
      graphDraftValid = false;
    }
  const showingLastValid = !graphDraftValid && !!studioDocument.lastValid;
  const workflow =
    draftWorkflow || studioDocument.lastValid?.workflow || config?.workflow;
  const liveWorkflow = runningWorkflow || workflow;
  const minutes = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <StudioShell
      document={studioDocument}
      tab={view}
      onTab={setView}
      onOpen={() => openInput.current?.click()}
      onExport={() => setExportOpen(true)}
      onTest={() => setShowTest(!showTest)}
      onValidate={() => void validateSource()}
      onUndo={undoSource}
      onRedo={() => dispatchDocument({ type: "redo" })}
      onConnection={() => setSettings(true)}
      testOpen={showTest}
    >
      <input
        ref={openInput}
        type="file"
        accept=".yaml,.yml,.studio.json"
        multiple
        hidden
        aria-label="Open workflow files"
        onChange={(event) => void openFiles(event.target.files)}
      />
      {fileNotices.length > 0 && (
        <div className="file-notices" role="status">
          {fileNotices.map((notice, index) => (
            <p key={index}>{notice}</p>
          ))}
          <button onClick={() => setFileNotices([])}>Dismiss</button>
        </div>
      )}
      {connected && !showTest && (
        <div className="minimized-call">
          <button onClick={() => setShowTest(true)}>
            <Radio size={15} />
            Return to test <span>{minutes}</span>
          </button>
          <button onClick={end}>Stop</button>
        </div>
      )}
      <div className="editor-layout">
        <main className="definition-panel">
          {(view === "workflow" || view === "routes") && showingLastValid && (
            <div className="last-valid-banner" role="status">
              Showing last valid graph · revision{" "}
              {studioDocument.lastValid!.revision}. Fix the current draft before
              testing.
              <button onClick={() => setView("yaml")}>Open YAML →</button>
            </div>
          )}
          {(view === "workflow" || view === "routes") && source ? (
            <Suspense
              fallback={
                <div className="loading-state">
                  <LoaderCircle className="spin" size={18} />
                  Loading workflow…
                </div>
              }
            >
              <WorkflowGraph
                mode={view === "routes" ? "routes" : "flow"}
                previewWorkflow={
                  showingLastValid
                    ? studioDocument.lastValid?.workflow
                    : undefined
                }
                readOnly={showingLastValid || !!studioDocument.running}
                selectedNodeId={selected}
                tools={toolManifests}
                hideInspector={showTest}
                onInspect={() => setShowTest(false)}
                onSources={(id) => {
                  setSelected(id);
                  setView("knowledge");
                }}
                onTransaction={(transaction) =>
                  dispatchDocument({ type: "transaction", transaction })
                }
                onHistoryEnd={() =>
                  dispatchDocument({ type: "end-history-group" })
                }
                metadata={studioDocument.metadata}
                onMetadata={(metadata) =>
                  dispatchDocument({
                    type: "metadata",
                    metadata,
                    label: "Edit layout",
                  })
                }
                source={source}
                onChange={changeSource}
                onUndo={undoSource}
                canUndo={history.length > 0}
                running={runningWorkflow}
                connected={connected}
                active={active}
                pending={pending}
                onYaml={() => setView("yaml")}
              />
            </Suspense>
          ) : view === "yaml" ? (
            <YamlWorkspace
              document={studioDocument}
              onChange={(value) => changeSource(value, "yaml")}
              onHistoryEnd={() =>
                dispatchDocument({ type: "end-history-group" })
              }
              onValidate={() => void validateSource()}
            />
          ) : view === "knowledge" && source ? (
            <SourcesPage
              document={studioDocument}
              capabilities={capabilities}
              selectedStep={selected}
              onChange={changeSource}
              onMetadata={(metadata) =>
                dispatchDocument({
                  type: "metadata",
                  metadata,
                  label: "Rename collection",
                })
              }
            />
          ) : source ? (
            <SettingsPage
              onHistoryEnd={() =>
                dispatchDocument({ type: "end-history-group" })
              }
              document={studioDocument}
              capabilities={capabilities}
              onTransaction={(transaction) =>
                dispatchDocument({ type: "transaction", transaction })
              }
              onConnection={() => setSettings(true)}
              onStep={(id) => {
                setSelected(id);
                setView("workflow");
              }}
            />
          ) : (
            <div className="loading-state">
              <LoaderCircle className="spin" size={18} />
              Loading agent…
            </div>
          )}
          <div className="definition-footer">
            <span>
              <ShieldCheck size={12} /> Local draft · export downloads a copy.
              Your original files stay under your control.
            </span>
            <button
              onClick={() => {
                changeSource(originalSource);
              }}
              disabled={source === originalSource}
            >
              <RotateCcw size={12} /> Revert to opened YAML
            </button>
          </div>
        </main>
        {showTest && (
          <TestPanel snapshot={studioDocument.running}>
            {connecting && !settings && (
              <button onClick={end}>Cancel connection</button>
            )}
            <div className="test-heading">
              <span>
                <Radio size={15} /> Test your agent
              </span>
              <button
                title="Back to editor"
                aria-label="Back to editor"
                onClick={() => setShowTest(false)}
              >
                <PanelRightClose size={16} />
                <span>Editor</span>
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
              {["conversation", "scenarios", "state", "sources", "trace"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTestTab(t)}
                    className={testTab === t ? "selected" : ""}
                  >
                    {pretty(t)}
                  </button>
                ),
              )}
            </div>
            {mode === "voice" && (connected || connecting) && (
              <VoiceCall
                name={liveWorkflow?.name || "Your agent"}
                phase={phase}
                connecting={connecting}
                mic={mic}
                remaining={remaining}
                orbRef={orbRef}
                onMute={() => {
                  if (mic) {
                    audio.current.stopMicrophone();
                    setMic(false);
                  } else void enableMicrophone();
                }}
                onEnd={end}
                onInterrupt={stop}
              />
            )}
            {activeScenario && testTab === "conversation" && (
              <div className="scenario-guide">
                <div>
                  <ClipboardList size={12} />
                  <strong>{activeScenario.title}</strong>
                  <button
                    title="Stop using this scenario"
                    onClick={() => setActiveScenario(null)}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="scenario-guide-controls">
                  <button
                    disabled={scenarioStep === 0 || connecting}
                    onClick={() =>
                      prepareTest(activeScenario, scenarioStep - 1)
                    }
                  >
                    Previous
                  </button>
                  <span>
                    Line {scenarioStep + 1} of {activeScenario.steps.length}
                  </span>
                  <button
                    disabled={
                      scenarioStep === activeScenario.steps.length - 1 ||
                      connecting
                    }
                    onClick={() =>
                      prepareTest(activeScenario, scenarioStep + 1)
                    }
                  >
                    Next line <ArrowRight size={10} />
                  </button>
                </div>
                <details>
                  <summary>Suggested line and expected behavior</summary>
                  <p>“{activeScenario.steps[scenarioStep].say}”</p>
                  <small>{activeScenario.steps[scenarioStep].expect}</small>
                </details>
              </div>
            )}
            {testTab === "scenarios" ? (
              <TestScenarios
                scenarios={config?.test_scenarios || []}
                connected={connected}
                connecting={connecting}
                activeId={activeScenario?.id || null}
                onPrepare={prepareTest}
              />
            ) : testTab === "conversation" ? (
              <div
                className="chat-scroll"
                aria-live="polite"
                aria-label="Conversation transcript"
              >
                {!chats.length &&
                !(mode === "voice" && (connected || connecting)) ? (
                  <div className="test-empty">
                    <VoiceOrb state={connecting ? "connecting" : "ready"} />
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
                          {liveWorkflow?.nodes[active]?.title || pretty(active)}
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
                      <span>Estimated TTFS</span>
                      <strong>
                        {gap === null ? "—" : `${(gap / 1000).toFixed(2)}s`}
                      </strong>
                      <small>
                        Microphone activity to first playback; estimated output
                        timing.
                      </small>
                    </div>
                    {timingSummary?.estimated_ttfs_ms.count ? (
                      <small>
                        {timingSummary.estimated_ttfs_ms.count} replies · avg{" "}
                        {(
                          (timingSummary.estimated_ttfs_ms.mean ?? 0) / 1000
                        ).toFixed(2)}
                        s · median{" "}
                        {(
                          (timingSummary.estimated_ttfs_ms.median ?? 0) / 1000
                        ).toFixed(2)}
                        s
                      </small>
                    ) : null}
                    {timingSummary?.retrieval_ms.count ? (
                      <small>
                        RAG · avg{" "}
                        {(timingSummary.retrieval_ms.mean ?? 0).toFixed(3)}ms ·
                        median{" "}
                        {(timingSummary.retrieval_ms.median ?? 0).toFixed(3)}
                        ms
                      </small>
                    ) : null}
                    <h3>
                      Collected facts <span>{Object.keys(facts).length}</span>
                    </h3>
                    {Object.entries(facts).length ? (
                      Object.entries(facts).map(([key, fact]) => (
                        <details className="fact-row" key={key}>
                          <summary>
                            <span>{pretty(key)}</span>
                            <strong>{String(fact.value ?? fact.status)}</strong>
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
                        <article className="source-card" key={source.chunk_id}>
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
            <div
              className={`test-session-status ${mode === "voice" && connected ? "voice-session-status" : ""}`}
            >
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
                    Stop
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
              <span>
                {(config?.call_limit_seconds ?? 300) / 60} minute limit ·
                simulated actions
              </span>
              <button
                onClick={download}
                disabled={!chats.length}
                title="Export session"
              >
                <Download size={12} />
              </button>
            </div>
          </TestPanel>
        )}
      </div>
      {exportOpen && (
        <ExportDialog
          document={studioDocument}
          onClose={() => setExportOpen(false)}
          onExported={(source) =>
            dispatchDocument({
              type: "export-recorded",
              source,
              at: Date.now(),
            })
          }
        />
      )}
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
        {connecting && <button onClick={end}>Cancel connection</button>}
        <p>
          {config?.credential_mode === "visitor"
            ? "This public demo requires your own credentials. Text needs OpenRouter; voice also needs the speech credentials below. Keys stay in this session."
            : "Use the hosted development budget when available, or enter your own provider keys. Keys stay in this session."}
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
          <VoiceCredentials
            speech={workflow?.speech}
            values={voiceKeys}
            statuses={credentials}
            onChange={setVoiceKeys}
          />
        )}
        <label className="input-label">
          Simulated transfer outcome
          <Select
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
          </Select>
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
    </StudioShell>
  );
}
