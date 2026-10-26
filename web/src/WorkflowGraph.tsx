import { memo, useCallback, useMemo, useRef, useState } from "react";
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
  ArrowRight,
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
  X,
} from "lucide-react";
import {
  branchLabel,
  buildGraph,
  type BranchEdge,
  type Point,
  type StageNode,
} from "./graph";
import { readWorkflow, type Workflow } from "./workflow";
import "@xyflow/react/dist/style.css";
import "./workflow-graph.css";

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
          stroke: data.highlighted ? "#3b7257" : "#a0a0a6",
          strokeWidth: data.highlighted ? 1.8 : 1.1,
        }}
      />
      {data.label && (
        <EdgeLabelRenderer>
          <button
            className={`flow-condition nodrag nopan ${data.highlighted ? "highlighted" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${data.x}px,${data.y}px)`,
            }}
            title={data.label}
            onClick={data.inspect}
            aria-label={`Transition: ${data.label}. Open source stage details.`}
          >
            <GitBranch size={11} />
            <span>{data.label}</span>
          </button>
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
  onEdit: (id: string) => void;
  onYaml: () => void;
};
export default function WorkflowGraph({
  source,
  running,
  connected,
  active,
  pending,
  onEdit,
  onYaml,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
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
  const selectedNode =
    selected && definition && Object.hasOwn(definition.nodes, selected)
      ? definition.nodes[selected]
      : undefined;
  const focus = useCallback(
    (id: string) => {
      const node = graph.nodes.find((n) => n.id === id);
      if (node && instance.current)
        void instance.current.setCenter(
          node.position.x + node.width! / 2,
          node.position.y + node.height! / 2,
          {
            zoom: 0.9,
            duration: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? 0
              : 250,
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
          inspect: n.data.synthetic ? undefined : () => setSelected(n.id),
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
          inspect: () => setSelected(e.source),
        },
      })),
    [graph.edges, connected, active, pending],
  );
  const topology =
    graph.nodes.map((n) => n.id).join("|") +
    graph.edges.map((e) => e.id + e.target).join("|");
  return (
    <section className="workflow-view" aria-label="Workflow visualization">
      <div className="workflow-toolbar">
        <div>
          <GitBranch size={15} />
          <strong>Conversation workflow</strong>
          <span>
            {graph.nodes.length ? graph.nodes.length - 1 : 0} stages ·{" "}
            {graph.edges.length ? graph.edges.length - 1 : 0} transitions
          </span>
        </div>
        <div>
          <span className={`flow-source-label ${connected ? "live" : ""}`}>
            {connected ? "Live session" : "YAML preview"}
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
              if (!node.data.synthetic) setSelected(node.id);
            }}
            onPaneClick={() => setSelected(null)}
            onInit={(flow) => {
              instance.current = flow;
              const start = graph.nodes.find((n) => n.data.synthetic)!;
              const width = viewport.current?.clientWidth || 700;
              void flow.setViewport({
                x: width / 2 - (start.position.x + start.width! / 2) * 0.78,
                y: 48 - start.position.y * 0.78,
                zoom: 0.78,
              });
            }}
            aria-label="Read-only YAML workflow. Pan to explore, use controls to zoom. Select a stage for its details."
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
          {selectedNode && (
            <aside className="flow-inspector" aria-label="Stage details">
              <div className="flow-inspector-header">
                <div>
                  <span>{selectedNode.kind} stage</span>
                  <h3>{selectedNode.title || selected}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close stage details"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flow-inspector-body">
                <section>
                  <h4>
                    {selectedNode.kind === "action" ? "Action" : "Instructions"}
                  </h4>
                  <p>
                    {selectedNode.prompt ||
                      selectedNode.text ||
                      (selectedNode.tool
                        ? `Run ${selectedNode.tool}.`
                        : "This stage ends the conversation.")}
                  </p>
                </section>
                {selectedNode.tool && (
                  <section>
                    <h4>Registered tool</h4>
                    <code>{selectedNode.tool}</code>
                    {!!selectedNode.requires?.length && (
                      <p className="flow-requires">
                        Requires: {selectedNode.requires.join(", ")}
                      </p>
                    )}
                  </section>
                )}
                {!!selectedNode.tools?.length && (
                  <section>
                    <h4>Tools</h4>
                    <p>{selectedNode.tools.join(", ")}</p>
                  </section>
                )}
                {!!selectedNode.knowledge?.length && (
                  <section>
                    <h4>Stage knowledge</h4>
                    <p>{selectedNode.knowledge.join(", ")}</p>
                  </section>
                )}
                {definition?.common_knowledge?.length ? (
                  <section>
                    <h4>Shared knowledge</h4>
                    <p>{definition.common_knowledge.join(", ")}</p>
                  </section>
                ) : null}
                {selectedNode.kind !== "end" && (
                  <section>
                    <h4>Listening</h4>
                    <p>
                      {selectedNode.patient
                        ? "Patient endpointing"
                        : "Standard endpointing"}
                    </p>
                  </section>
                )}
                {!!selectedNode.edges?.length && (
                  <section>
                    <h4>Transitions</h4>
                    {selectedNode.edges.map((e) => (
                      <div className="flow-inspector-edge" key={e.id}>
                        <p>{branchLabel(e)}</p>
                        <button
                          onClick={() => {
                            setSelected(e.to);
                            focus(e.to);
                          }}
                        >
                          <ArrowRight size={12} />
                          {definition?.nodes[e.to]?.title || e.to}
                        </button>
                        {e.timing === "before_action" && (
                          <small>Guard checked before action</small>
                        )}
                      </div>
                    ))}
                  </section>
                )}
              </div>
              <div className="flow-inspector-footer">
                <button className="button" onClick={() => onEdit(selected!)}>
                  <Code2 size={13} />
                  Edit stage instructions
                </button>
              </div>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
