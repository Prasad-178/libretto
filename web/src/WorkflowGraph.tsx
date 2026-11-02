import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type EdgeProps,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  AudioLines,
  BookOpen,
  CircleMinus,
  Code2,
  Flag,
  GitBranch,
  Maximize2,
  Scan,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  branchLabel,
  buildGraph,
  resizeViewport,
  type BranchEdge,
  type Point,
  type StageNode,
} from "./graph";
import { readWorkflow, type Workflow } from "./workflow";
import "@xyflow/react/dist/style.css";
import "./workflow-graph.css";
import StepInspector, { type Selection } from "./StepInspector";

const sides = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};
const StageCard = memo(function StageCard({ data }: NodeProps<StageNode>) {
  const n = data.stage;
  const terminal = n.kind === "end" || data.synthetic;
  const Icon = data.synthetic
    ? Flag
    : n.kind === "end"
      ? CircleMinus
      : n.kind === "action"
        ? Wrench
        : AudioLines;
  const tools = n.tool ? [n.tool] : n.tools || [];
  return (
    <div
      role={data.synthetic ? undefined : "button"}
      tabIndex={data.synthetic ? undefined : 0}
      aria-label={
        data.synthetic
          ? undefined
          : `Open ${n.title || data.stageId} stage details`
      }
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) data.focus?.();
      }}
      onClick={data.inspect}
      onKeyDown={(e) => {
        if (!data.synthetic && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          data.inspect?.();
        }
      }}
      className={`flow-card ${terminal ? "flow-terminal" : ""} ${data.inspected ? "inspected" : ""} ${data.active ? "is-active" : ""} ${data.pending ? "is-pending" : ""}`}
    >
      {Object.entries(sides).flatMap(([side, position]) => [
        <Handle
          key={`s-${side}`}
          id={`source-${side}`}
          type="source"
          position={position}
          isConnectable={false}
        />,
        <Handle
          key={`t-${side}`}
          id={`target-${side}`}
          type="target"
          position={position}
          isConnectable={false}
        />,
      ])}
      <div className="flow-card-title">
        <Icon size={18} strokeWidth={1.7} />
        <strong>{n.title || data.stageId || "Untitled stage"}</strong>
        {data.active && <span className="flow-live-dot" title="Active stage" />}
        {data.pending && <span className="flow-pending-label">Next</span>}
      </div>
      {!terminal && (
        <>
          <p>
            {n.prompt ||
              n.text ||
              (n.tool
                ? `Run ${n.tool.replaceAll("_", " ")} after checking required facts and confirmation.`
                : "No stage instructions yet.")}
          </p>
          <div className="flow-card-footer">
            {tools.length ? (
              <span>
                <Wrench size={12} />
                {tools.length === 1
                  ? tools[0].replaceAll("_", " ")
                  : `${tools.length} tools`}
              </span>
            ) : (
              <span className="flow-node-kind">
                {n.kind === "say" ? "Speak" : "Conversation"}
              </span>
            )}
            {!!n.knowledge?.length && (
              <span title="Stage knowledge">
                <BookOpen size={12} />
                {n.knowledge.length}
              </span>
            )}
            {n.patient && <span className="flow-patient">Patient</span>}
          </div>
        </>
      )}
    </div>
  );
});

// Smooth the layout engine's routed points, preserving separate routes for loops/outcomes.
function routedPath(points: Point[]): string {
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      previous = points[i - 1],
      next = points[i + 1];
    const before = Math.hypot(p.x - previous.x, p.y - previous.y);
    const after = Math.hypot(next.x - p.x, next.y - p.y);
    const radius = Math.min(24, before / 2, after / 2);
    const a = before
      ? {
          x: p.x + ((previous.x - p.x) * radius) / before,
          y: p.y + ((previous.y - p.y) * radius) / before,
        }
      : p;
    const b = after
      ? {
          x: p.x + ((next.x - p.x) * radius) / after,
          y: p.y + ((next.y - p.y) * radius) / after,
        }
      : p;
    path += ` L ${a.x},${a.y} Q ${p.x},${p.y} ${b.x},${b.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x},${last.y}`;
}
const Branch = memo(function Branch({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
}: EdgeProps<BranchEdge>) {
  if (!data) return null;
  const points = [
    { x: sourceX, y: sourceY },
    ...data.points.slice(1, -1),
    { x: targetX, y: targetY },
  ];
  return (
    <>
      <BaseEdge
        id={id}
        path={routedPath(points)}
        markerEnd={markerEnd}
        style={{
          stroke: data.selected
            ? "#245EC7"
            : data.highlighted
              ? "#28745B"
              : "#A7B7C7",
          strokeWidth: data.selected || data.highlighted ? 2 : 1.4,
        }}
      />
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className="flow-edge-actions"
            style={{
              transform: `translate(-50%, -50%) translate(${data.x}px,${data.y}px)`,
            }}
          >
            <button
              className={`flow-condition nodrag nopan ${data.highlighted ? "highlighted" : ""} ${data.selected ? "selected" : ""}`}
              title={data.label}
              onClick={data.inspect}
              aria-label={`Edit transition: ${data.label}`}
            >
              <span>{data.label}</span>
            </button>
            {data.insert && (
              <button
                className="flow-insert nodrag nopan"
                aria-label={`Insert step on transition: ${data.label}`}
                title="Insert a step"
                onClick={data.insert}
              >
                +
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
const nodeTypes = { stage: StageCard };
const edgeTypes = { branch: Branch };
const fitOptions = { padding: 0.16, maxZoom: 0.85 };

type Props = {
  source: string;
  running: Workflow | null;
  connected: boolean;
  active: string;
  pending: string | null;
  onYaml: () => void;
  onChange: (source: string) => void;
  onUndo: () => void;
  canUndo: boolean;
};
export default function WorkflowGraph({
  source,
  running,
  connected,
  active,
  pending,
  onYaml,
  onChange,
  onUndo,
  canUndo,
}: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const selected = selection?.kind === "step" ? selection.id : null;
  const instance = useRef<ReactFlowInstance<StageNode, BranchEdge> | null>(
    null,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const definition = useMemo(
    () => (connected && running ? running : readWorkflow(source)),
    [source, connected, running],
  );
  const graph = useMemo(() => {
    try {
      if (!definition)
        throw new Error("Fix your YAML syntax to visualize the workflow.");
      return { ...buildGraph(definition), error: "" };
    } catch (error) {
      return {
        nodes: [],
        edges: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to read the workflow.",
      };
    }
  }, [definition]);
  useEffect(() => {
    const canvas = viewport.current;
    if (!canvas) return;
    let width = canvas.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = canvas.clientWidth;
      if (
        instance.current &&
        width > 0 &&
        nextWidth > 0 &&
        nextWidth !== width
      ) {
        void instance.current.setViewport(
          resizeViewport(instance.current.getViewport(), width, nextWidth),
        );
      }
      width = nextWidth;
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [graph.error]);
  const focus = useCallback(
    (id: string) => {
      const node = graph.nodes.find((n) => n.id === id);
      if (node && instance.current)
        void instance.current.setCenter(
          node.position.x + node.width! / 2,
          node.position.y + node.height! / 2,
          {
            zoom: 0.9,
            duration: 0,
          },
        );
    },
    [graph.nodes],
  );
  const nodes = useMemo(
    () =>
      graph.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          active: connected && n.id === active,
          pending: connected && n.id === pending,
          inspected: n.id === selected,
          stageId: n.id,
          inspect: n.data.synthetic
            ? undefined
            : () => {
                setSelection({ kind: "step", id: n.id });
                focus(n.id);
              },
          focus: () => focus(n.id),
        },
      })),
    [graph.nodes, connected, active, pending, selected, focus],
  );
  const edges = useMemo(
    () =>
      graph.edges.map((e) => ({
        ...e,
        markerEnd: {
          type: MarkerType.Arrow,
          width: 16,
          height: 16,
          color: "#a0a0a6",
        },
        data: {
          ...e.data!,
          highlighted: connected && e.source === active && e.target === pending,
          selected:
            selection?.kind === "edge" &&
            JSON.stringify([selection.source, selection.edgeId]) === e.id,
          inspect: () => {
            const [, edgeId] = JSON.parse(e.id);
            setSelection({ kind: "edge", source: e.source, edgeId });
            focus(e.source);
          },
          insert:
            !connected &&
            definition?.nodes[e.source]?.edges?.find(
              (edge) => JSON.stringify([e.source, edge.id]) === e.id,
            )?.timing !== "before_action"
              ? () => {
                  const [, edgeId] = JSON.parse(e.id);
                  setSelection({ kind: "insert", source: e.source, edgeId });
                  focus(e.source);
                }
              : undefined,
        },
      })),
    [graph.edges, connected, active, pending, selection, definition, focus],
  );
  const topology =
    graph.nodes.map((n) => n.id).join("|") +
    graph.edges.map((e) => e.id + e.target).join("|");
  const selectedStage =
    selection?.kind === "step" ? selection.id : selection?.source;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    if (!selectedStage) return;
    const frame = requestAnimationFrame(() => focusRef.current(selectedStage));
    return () => cancelAnimationFrame(frame);
  }, [selectedStage, topology]);
  return (
    <section className="workflow-view" aria-label="Workflow visualization">
      <div className="workflow-toolbar">
        <div>
          <GitBranch size={15} />
          <strong>Conversation workflow</strong>
          <span>
            {graph.nodes.length ? graph.nodes.length - 1 : 0} steps ·{" "}
            {graph.edges.length ? graph.edges.length - 1 : 0} transitions
          </span>
        </div>
        <div>
          <span className={`flow-source-label ${connected ? "live" : ""}`}>
            {connected ? "Live session" : "Click a step to edit"}
          </span>
          <button title="Open YAML definition" onClick={onYaml}>
            <Code2 size={14} />
            <span>YAML</span>
          </button>
        </div>
      </div>
      {connected && source && (
        <div className="flow-session-note">
          <ShieldCheck size={12} />
          Showing the running definition. YAML edits apply to your next test.
        </div>
      )}
      {graph.error ? (
        <div className="flow-empty" role="status">
          <GitBranch size={25} />
          <h3>Workflow preview unavailable</h3>
          <p>{graph.error}</p>
          <button className="button" onClick={onYaml}>
            <Code2 size={14} />
            Open YAML
          </button>
        </div>
      ) : (
        <div className="workflow-surface">
          <div className="workflow-canvas" ref={viewport}>
            <ReactFlow<StageNode, BranchEdge>
              key={topology}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesReconnectable={false}
              deleteKeyCode={null}
              nodesFocusable={false}
              edgesFocusable={false}
              elementsSelectable={false}
              minZoom={0.08}
              maxZoom={1.5}
              onNodeClick={(_, node) => {
                if (!node.data.synthetic) {
                  setSelection({ kind: "step", id: node.id });
                  focus(node.id);
                }
              }}
              onPaneClick={() => setSelection(null)}
              onInit={(flow) => {
                instance.current = flow;
                const start =
                  graph.nodes.find((n) => n.id === selected) ||
                  graph.nodes.find((n) => n.data.synthetic)!;
                const width = viewport.current?.clientWidth || 700;
                void flow.setViewport({
                  x: width / 2 - (start.position.x + start.width! / 2) * 0.78,
                  y: 48 - start.position.y * 0.78,
                  zoom: 0.78,
                });
              }}
              aria-label="Workflow editor. Select a step to edit its prompt. Select a transition to edit its rules or insert a step."
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={22}
                size={1}
                color="#d0d0d5"
              />
              <Controls showInteractive={false} fitViewOptions={fitOptions} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) =>
                  connected && n.id === active ? "#b2cebd" : "#e1e1e5"
                }
                maskColor="rgba(250,250,250,.8)"
                ariaLabel="Workflow overview"
              />
              <div className="flow-top-controls">
                <button
                  className="button"
                  onClick={() => void instance.current?.fitView(fitOptions)}
                >
                  <Maximize2 size={13} />
                  Fit workflow
                </button>
                <select
                  className="flow-step-jump"
                  aria-label="Jump to step"
                  value={selected || ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelection({ kind: "step", id: e.target.value });
                      focus(e.target.value);
                    }
                  }}
                >
                  <option value="">Find a step…</option>
                  {Object.entries(definition?.nodes || {}).map(([id, n]) => (
                    <option key={id} value={id}>
                      {n.title || id}
                    </option>
                  ))}
                </select>
                {connected && (
                  <button className="button" onClick={() => focus(active)}>
                    <Scan size={13} />
                    Active stage
                  </button>
                )}
              </div>
              <div className="flow-canvas-hint">
                Drag to explore <span>·</span> Scroll to zoom
              </div>
            </ReactFlow>
          </div>
          {selection && definition && (
            <StepInspector
              key={
                selection.kind +
                (selection.kind === "step"
                  ? selection.id
                  : selection.source + selection.edgeId)
              }
              source={source}
              workflow={definition}
              selection={selection}
              onSelect={setSelection}
              onChange={onChange}
              onClose={() => setSelection(null)}
              onYaml={onYaml}
              onUndo={onUndo}
              canUndo={canUndo}
              readOnly={connected}
            />
          )}
        </div>
      )}
    </section>
  );
}
