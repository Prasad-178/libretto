import { ArrowDownRight, Check, Circle, GitBranch, Zap } from "lucide-react";
export type FlowNode = {
  kind: string;
  title: string;
  prompt: string;
  tools: string[];
  tool?: string;
  patient: boolean;
  edges: {
    id: string;
    to: string;
    condition?: string;
    result?: string;
    predicate?: unknown;
  }[];
};
export type Workflow = {
  id: string;
  name: string;
  description: string;
  shared_prompt: string;
  start: string;
  models: { speaker: string; evaluator: string };
  nodes: Record<string, FlowNode>;
};
export function StageRail({
  workflow,
  active,
  pending,
  visited,
  select,
  selected,
}: {
  workflow: Workflow;
  active: string;
  pending: string | null;
  visited: Set<string>;
  select: (id: string) => void;
  selected: string;
}) {
  return (
    <aside className="stage-rail">
      <div className="section-label">
        <GitBranch size={13} /> THE SCORE{" "}
        <span>{Object.keys(workflow.nodes).length} stages</span>
      </div>
      <div className="stage-list">
        {Object.entries(workflow.nodes).map(([id, node], i) => (
          <button
            key={id}
            onClick={() => select(id)}
            className={`stage-row ${active === id ? "active" : ""} ${selected === id ? "selected" : ""}`}
            aria-current={active === id ? "step" : undefined}
          >
            <span className={`stage-dot ${visited.has(id) ? "visited" : ""}`}>
              {active === id ? (
                <span />
              ) : visited.has(id) ? (
                <Check size={10} />
              ) : (
                <span className="stage-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
              )}
            </span>
            <span className="stage-copy">
              <strong>{node.title || id}</strong>
              <small>
                {pending === id
                  ? "Up next"
                  : node.kind === "action"
                    ? "Runtime action"
                    : node.kind === "end"
                      ? "Conversation ends"
                      : node.patient
                        ? "Patient listening"
                        : "Conversation"}
              </small>
            </span>
            {node.kind === "action" ? (
              <Zap size={12} className="muted" />
            ) : active === id ? (
              <span className="live-dot" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="rail-note">
        <Circle size={12} />
        <p>
          The YAML defines the flow.
          <br />
          The runtime keeps its place.
        </p>
      </div>
    </aside>
  );
}
export function WorkflowMap({
  workflow,
  active,
}: {
  workflow: Workflow;
  active: string;
}) {
  const levels = new Map<string, number>([[workflow.start, 0]]);
  const queue = [workflow.start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of workflow.nodes[id].edges)
      if (!levels.has(edge.to)) {
        levels.set(edge.to, (levels.get(id) || 0) + 1);
        queue.push(edge.to);
      }
  }
  const counts = new Map<number, number>();
  const positions = Object.fromEntries(
    Object.keys(workflow.nodes).map((id) => {
      const rank = levels.get(id) || 0;
      const col = counts.get(rank) || 0;
      counts.set(rank, col + 1);
      return [id, { x: 22 + col * 210, y: 30 + rank * 110 }];
    }),
  );
  const width = Math.max(...Object.values(positions).map((p) => p.x)) + 205;
  const height = Math.max(...Object.values(positions).map((p) => p.y)) + 110;
  return (
    <div className="map-scroll">
      <div className="map-caption">
        <ArrowDownRight size={14} /> Generated from the same workflow the
        runtime executes.
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={Math.max(width, 500)}
        height={height}
        role="img"
        aria-label="Receptionist workflow graph"
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 L6 3 L0 6" fill="none" stroke="#a5a298" />
          </marker>
        </defs>
        {Object.entries(workflow.nodes).flatMap(([id, node]) =>
          node.edges.map((edge) => {
            const a = positions[id],
              b = positions[edge.to];
            const sx = a.x + 90,
              sy = a.y + 60,
              ex = b.x + 90,
              ey = b.y;
            return (
              <path
                key={`${id}-${edge.id}`}
                d={`M ${sx} ${sy} C ${sx} ${sy + 30}, ${ex} ${ey - 30}, ${ex} ${ey}`}
                fill="none"
                stroke="#ccc8be"
                strokeWidth="1.2"
                markerEnd="url(#arrow)"
              />
            );
          }),
        )}
        {Object.entries(workflow.nodes).map(([id, node]) => {
          const p = positions[id];
          const current = active === id;
          return (
            <g key={id} transform={`translate(${p.x},${p.y})`}>
              <rect
                width="180"
                height="60"
                rx="7"
                fill={current ? "#a93f32" : "#fdfcf8"}
                stroke={current ? "#a93f32" : "#d9d5cb"}
                strokeDasharray={node.kind === "action" ? "4 2" : undefined}
              />
              <text
                x="13"
                y="24"
                fill={current ? "#fff" : "#27251f"}
                fontSize="12"
                fontWeight="600"
              >
                {node.title}
              </text>
              <text
                x="13"
                y="44"
                fill={current ? "#f1d4cb" : "#858176"}
                fontSize="10"
              >
                {node.kind === "action" ? node.tool : node.kind}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
