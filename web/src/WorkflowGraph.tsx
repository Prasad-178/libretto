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
import { describeRoutes, presentRoutes } from "./studio/graph-model";
import type { ToolManifest } from "./studio/tool-manifest";
import { RoutesTable } from "./studio/RoutesTable";
import { emptyMetadata } from "./studio/document-store";
import { routeKey } from "./studio/workflow-model";
import type {
  GraphLayout,
  StudioMetadata,
  RouteRef,
  DocumentTransaction,
} from "./studio/types";

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
  return (
    <div
      role={data.synthetic ? undefined : "button"}
      tabIndex={data.synthetic ? undefined : 0}
      aria-label={
        data.synthetic ? undefined : `Open ${n.title || data.stageId} step`
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
      className={`flow-card ${n.kind === "action" ? "flow-action" : ""} ${terminal ? "flow-terminal" : ""} ${data.inspected ? "inspected" : ""} ${data.active ? "is-active" : ""} ${data.pending ? "is-pending" : ""}`}
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
        <strong title={n.title || data.stageId}>
          {n.title || data.stageId || "Untitled step"}
        </strong>
        {!terminal && (
          <span className="flow-exit-count">
            {data.exits} {data.exits === 1 ? "exit" : "exits"}
          </span>
        )}
        {data.active && <span className="flow-live-dot" title="Active stage" />}
        {data.pending && <span className="flow-pending-label">Next</span>}
      </div>
      {!terminal && (
        <>
          <p>
            {n.kind === "action"
              ? n.tool
              : n.kind === "say"
                ? "Exact message"
                : "Conversation"}
            {n.patient ? " · patient" : ""}
            {n.knowledge?.length ? ` · ${n.knowledge.length} sources` : ""}
          </p>
          {!!data.chips?.length && (
            <div className="flow-destination-chips">
              {data.chips.slice(0, 1).map((chip) => (
                <button
                  key={chip.label}
                  title={`${chip.label} → ${chip.target}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    chip.inspect();
                  }}
                >
                  {chip.label} → {chip.target}
                </button>
              ))}
              {data.chips.length > 1 && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    data.inspect?.();
                  }}
                >
                  +{data.chips.length - 1} more
                </button>
              )}
            </div>
          )}
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
            {data.members && data.members.length > 1 ? (
              <details className="flow-bundle nodrag nopan">
                <summary className="flow-condition">
                  {data.members.length} results →
                </summary>
                <div>
                  {data.members.map((member, index) => (
                    <button key={index} onClick={member.inspect}>
                      {member.label}
                    </button>
                  ))}
                </div>
              </details>
            ) : (
              <button
                className={`flow-condition nodrag nopan ${data.highlighted ? "highlighted" : ""} ${data.selected ? "selected" : ""}`}
                title={data.label}
                onClick={data.inspect}
                aria-label={`Edit transition: ${data.label}`}
              >
                <span>{data.label}</span>
              </button>
            )}
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
const fitOptions = { padding: 0.16, maxZoom: 1 };

type Props = {
  source: string;
  running: Workflow | null;
  connected: boolean;
  active: string;
  pending: string | null;
  onYaml: () => void;
  onChange: (source: string, group?: string) => void;
  onTransaction?: (tx: DocumentTransaction) => void;
  onHistoryEnd?: () => void;
  onInspect?: () => void;
  onSources?: (id: string) => void;
  tools?: ToolManifest[];
  hideInspector?: boolean;
  previewWorkflow?: Workflow | null;
  selectedNodeId?: string;
  readOnly?: boolean;
  onUndo: () => void;
  canUndo: boolean;
  metadata?: StudioMetadata;
  onMetadata?: (metadata: StudioMetadata) => void;
  mode?: "flow" | "routes";
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
  metadata = emptyMetadata(),
  onMetadata,
  mode = "flow",
  onTransaction,
  onHistoryEnd,
  onInspect,
  onSources,
  tools,
  hideInspector,
  previewWorkflow,
  selectedNodeId,
  readOnly = false,
}: Props) {
  const [selection, updateSelection] = useState<Selection | null>(null);
  function setSelection(next: Selection | null) {
    if (next) onInspect?.();
    updateSelection(next);
  }
  const [viewId, setViewId] = useState("");
  const [viewName, setViewName] = useState("");
  const [viewRoutes, setViewRoutes] = useState<Set<string> | null>(null);
  const previousLayout = useRef<{ id: string; layout: GraphLayout } | null>(
    null,
  );
  const [revealed, setRevealed] = useState<RouteRef | null>(null);
  const [showRoutes, setShowRoutes] = useState(mode === "routes");
  useEffect(() => setShowRoutes(mode === "routes"), [mode]);
  const view = metadata.views.find((v) => v.id === viewId) || null;
  const selected = selection?.kind === "step" ? selection.id : null;
  const instance = useRef<ReactFlowInstance<StageNode, BranchEdge> | null>(
    null,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const definition = useMemo(
    () =>
      connected && running ? running : previewWorkflow || readWorkflow(source),
    [source, connected, running, previewWorkflow],
  );
  const graph = useMemo(() => {
    try {
      if (!definition)
        throw new Error("Fix your YAML syntax to visualize the workflow.");
      const result = buildGraph(
        definition,
        metadata,
        previousLayout.current?.id === definition.id
          ? previousLayout.current.layout
          : undefined,
      );
      return { ...result, error: "" };
    } catch (error) {
      return {
        nodes: [],
        edges: [],
        layout: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read the workflow.",
      };
    }
  }, [definition, metadata.positions]);
  useEffect(() => {
    if (!graph.error && definition && graph.layout)
      previousLayout.current = { id: definition.id, layout: graph.layout };
  }, [graph, definition]);
  const routes = useMemo(
    () => (definition && !graph.error ? describeRoutes(definition) : []),
    [definition, graph.error],
  );
  const presentation = presentRoutes(routes, view);
  const hiddenCount = presentation
    .filter((p) => p.mode === "hidden")
    .reduce((n, p) => n + p.refs.length, 0);
  function selectRoute(ref: RouteRef) {
    setSelection({ kind: "edge", ...ref });
  }
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
          node.position.x +
            node.width! / 2 +
            (() => {
              const inspector =
                viewport.current?.parentElement?.querySelector<HTMLElement>(
                  ".studio-inspector",
                );
              return inspector &&
                window.getComputedStyle(inspector).position === "absolute"
                ? inspector.clientWidth / (2 * instance.current!.getZoom())
                : 0;
            })(),
          node.position.y + node.height! / 2,
          {
            zoom: instance.current.getZoom(),
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
          chips: presentation
            .filter((p) => p.mode === "chip" && p.refs[0].source === n.id)
            .flatMap((p) =>
              p.refs.map((ref) => ({
                label: routes.find((r) => routeKey(r.ref) === routeKey(ref))!
                  .label,
                target: definition?.nodes[p.target].title || p.target,
                inspect: () => selectRoute(ref),
              })),
            ),
          inspect: n.data.synthetic
            ? undefined
            : () => {
                setSelection({ kind: "step", id: n.id });
                focus(n.id);
              },
          focus: () => focus(n.id),
        },
      })),
    [graph.nodes, connected, active, pending, selected, focus, view, routes],
  );
  const edges = useMemo(
    () =>
      graph.edges
        .filter(
          (e) =>
            !e.data?.label ||
            routeKey(revealed || { source: "", edgeId: "" }) === e.id ||
            presentation.some(
              (p) =>
                p.mode !== "hidden" &&
                p.mode !== "chip" &&
                routeKey(p.refs[0]) === e.id,
            ),
        )
        .map((e) => ({
          ...e,
          markerEnd: {
            type: MarkerType.Arrow,
            width: 16,
            height: 16,
            color: "#a0a0a6",
          },
          data: {
            ...e.data!,
            members: presentation
              .find((p) => p.mode === "bundle" && routeKey(p.refs[0]) === e.id)
              ?.refs.map((ref) => ({
                label: routes.find((r) => routeKey(r.ref) === routeKey(ref))!
                  .label,
                inspect: () => selectRoute(ref),
              })),
            highlighted:
              connected && e.source === active && e.target === pending,
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
              !readOnly &&
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
    [
      graph.edges,
      connected,
      active,
      pending,
      selection,
      definition,
      focus,
      view,
      routes,
      revealed,
      readOnly,
    ],
  );
  useEffect(() => {
    setSelection(null);
    setViewId("");
    setRevealed(null);
    const start = graph.nodes.find((n) => n.data.synthetic);
    if (start && instance.current)
      void instance.current.setViewport({
        x:
          (viewport.current?.clientWidth || 700) / 2 -
          (start.position.x + start.width! / 2),
        y: 48 - start.position.y,
        zoom: 1,
      });
  }, [definition?.id]);
  useEffect(() => {
    if (selectedNodeId && definition?.nodes[selectedNodeId])
      setSelection({ kind: "step", id: selectedNodeId });
  }, [selectedNodeId]);
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
          <strong>{showRoutes ? "Routes" : "Flow"}</strong>
          <select
            aria-label="Canvas view"
            value={viewId}
            onChange={(event) => {
              setViewId(event.target.value);
              setRevealed(null);
            }}
          >
            <option value="">All routes</option>
            {metadata.views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {hiddenCount > 0 && (
            <span>
              {hiddenCount} hidden ·{" "}
              <button onClick={() => setViewId("")}>Show all</button>
            </span>
          )}
          <span>
            {graph.nodes.length ? graph.nodes.length - 1 : 0} steps ·{" "}
            {graph.edges.length ? graph.edges.length - 1 : 0} transitions
          </span>
        </div>
        <div>
          <span className={`flow-source-label ${connected ? "live" : ""}`}>
            {connected ? "Live session" : "Click a step to edit"}
          </span>
          <button onClick={() => setShowRoutes(!showRoutes)}>
            {showRoutes ? "Canvas" : "Routes index"}
          </button>
          {onMetadata && !connected && (
            <details className="view-editor">
              <summary>Save view</summary>
              <div>
                <label>
                  View name
                  <input
                    value={viewName}
                    onChange={(e) => setViewName(e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>Routes to show</legend>
                  {routes.map((r) => (
                    <label key={routeKey(r.ref)}>
                      <input
                        type="checkbox"
                        checked={
                          viewRoutes ? viewRoutes.has(routeKey(r.ref)) : true
                        }
                        onChange={(e) =>
                          setViewRoutes((old) => {
                            const next = new Set(
                              old || routes.map((r) => routeKey(r.ref)),
                            );
                            if (e.target.checked) next.add(routeKey(r.ref));
                            else next.delete(routeKey(r.ref));
                            return next;
                          })
                        }
                      />
                      {definition?.nodes[r.ref.source].title || r.ref.source} ·{" "}
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                <button
                  disabled={!viewName.trim()}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    onMetadata({
                      ...metadata,
                      views: [
                        ...metadata.views,
                        {
                          id,
                          name: viewName.trim(),
                          visibleRoutes: routes
                            .filter(
                              (r) =>
                                !viewRoutes || viewRoutes.has(routeKey(r.ref)),
                            )
                            .map((r) => r.ref),
                        },
                      ],
                    });
                    setViewId(id);
                    setViewName("");
                  }}
                >
                  Save named view
                </button>
              </div>
            </details>
          )}
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
          {showRoutes && definition ? (
            <RoutesTable
              workflow={definition}
              view={view}
              onSelect={selectRoute}
              onReveal={(ref) => {
                setRevealed(ref);
                setShowRoutes(false);
                selectRoute(ref);
                focus(ref.source);
              }}
            />
          ) : (
            <div className="workflow-canvas" ref={viewport}>
              <ReactFlow<StageNode, BranchEdge>
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
                    graph.nodes.find(
                      (n) =>
                        n.id ===
                        (selection?.kind === "step"
                          ? selection.id
                          : selection?.source),
                    ) || graph.nodes.find((n) => n.data.synthetic)!;
                  const width = viewport.current?.clientWidth || 700;
                  void flow.setViewport({
                    x: width / 2 - (start.position.x + start.width! / 2) * 1,
                    y: 48 - start.position.y * 1,
                    zoom: 1,
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
          )}
          {selection && definition && !hideInspector && (
            <StepInspector
              key={
                selection.kind +
                (selection.kind === "step"
                  ? selection.id
                  : selection.source + selection.edgeId)
              }
              tools={tools}
              onTransaction={onTransaction}
              onHistoryEnd={onHistoryEnd}
              onSources={onSources}
              source={source}
              workflow={definition}
              selection={selection}
              onSelect={setSelection}
              onChange={onChange}
              onClose={() => setSelection(null)}
              onYaml={onYaml}
              onUndo={onUndo}
              canUndo={canUndo}
              readOnly={connected || readOnly}
            />
          )}
        </div>
      )}
    </section>
  );
}
