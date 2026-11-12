import type { EventPacket } from "../client";
import type { Workflow } from "../workflow";
import { debugNotice } from "./debug-events";
import { humanizeId } from "./workflow-model";
export function DebugSummary({
  workflow,
  active,
  events,
  facts,
  onStep,
  onEvents,
}: {
  workflow: Workflow | null | undefined;
  active: string;
  events: EventPacket[];
  facts: Record<string, { value: string | boolean | null; status: string }>;
  onStep: (id: string) => void;
  onEvents: () => void;
}) {
  const notice = debugNotice(events);
  const name = (id: string) => workflow?.nodes[id]?.title || humanizeId(id);
  const timeline = events
    .filter((event) =>
      [
        "transition",
        "readback",
        "interrupted",
        "speech_interrupted",
        "confirmation_withheld",
        "action_blocked",
        "readback_blocked",
        "tool_started",
        "tool_result",
        "speech_error",
        "ready",
        "ended",
      ].includes(event.type),
    )
    .slice(-8);
  return (
    <aside className="debug-summary" aria-label="Runtime summary">
      <section>
        <h3>Current step</h3>
        <strong className="debug-current-step">
          {active ? name(active) : "No test running"}
        </strong>
        {active && (
          <button className="inspector-link" onClick={() => onStep(active)}>
            Show in workflow →
          </button>
        )}
      </section>
      {notice && (
        <section className="debug-notice" role="status">
          <h3>{notice.title}</h3>
          <p>{notice.reason}</p>
          {notice.node && (
            <button
              className="inspector-link"
              onClick={() => onStep(notice.node!)}
            >
              Inspect {name(notice.node)} →
            </button>
          )}
          {notice.policy && (
            <small>Confirmation rule · {humanizeId(notice.policy)}</small>
          )}
        </section>
      )}
      <section>
        <h3>Collected data</h3>
        {Object.entries(facts).length ? (
          <dl>
            {Object.entries(facts).map(([id, fact]) => (
              <div key={id}>
                <dt>{humanizeId(id)}</dt>
                <dd>
                  {fact.value === null
                    ? fact.status
                    : typeof fact.value === "boolean"
                      ? fact.value
                        ? "Yes"
                        : "No"
                      : fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Information extracted during this test appears here.</p>
        )}
      </section>
      <section className="debug-timeline">
        <h3>Event timeline</h3>
        {timeline.length ? (
          <ol>
            {timeline.map((event, index) => (
              <li key={index}>
                <time>{event.at.toFixed(2)}s</time>
                <div>
                  {humanizeId(event.type)}
                  {event.data.reason && <p>{event.data.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>Runtime events appear after you connect.</p>
        )}
        <button className="inspector-link" onClick={onEvents}>
          View raw events →
        </button>
      </section>
    </aside>
  );
}
