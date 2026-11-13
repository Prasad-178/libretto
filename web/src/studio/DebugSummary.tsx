import type { EventPacket } from "../client";
import type { Workflow } from "../workflow";
import { diagnosticTargets, type DiagnosticTarget } from "./debug-navigation";
import { debugNotice } from "./debug-events";
import { humanizeId } from "./workflow-model";
export function DebugSummary({
  workflow,
  active,
  events,
  facts,
  onStep,
  onEvents,
  onNavigate,
  navigationEnabled = true,
  canEditRules = false,
}: {
  workflow: Workflow | null | undefined;
  active: string;
  events: EventPacket[];
  facts: Record<string, { value: string | boolean | null; status: string }>;
  onStep: (id: string) => void;
  onEvents: () => void;
  onNavigate?: (target: DiagnosticTarget) => void;
  navigationEnabled?: boolean;
  canEditRules?: boolean;
}) {
  const notice = debugNotice(events);
  const targets =
    notice && workflow ? diagnosticTargets({ ...notice }, workflow) : [];
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
          {notice.code && (
            <code className="debug-reason-code">{notice.code}</code>
          )}
          <p>{notice.reason}</p>
          {!!notice.missingFields?.length && (
            <p>Needs: {notice.missingFields.map(humanizeId).join(", ")}</p>
          )}
          {notice.node && (
            <button
              className="inspector-link"
              disabled={!navigationEnabled}
              onClick={() => onStep(notice.node!)}
            >
              Inspect {name(notice.node)} →
            </button>
          )}
          {notice.policy && (
            <small>Confirmation rule · {humanizeId(notice.policy)}</small>
          )}
          {onNavigate &&
            targets.map((target, index) => (
              <button
                key={index}
                className="inspector-link"
                disabled={
                  !navigationEnabled ||
                  (target.kind === "policy" && !canEditRules)
                }
                title={
                  target.kind === "policy" && !canEditRules
                    ? "Stop the test before editing its confirmation rule"
                    : undefined
                }
                onClick={() => onNavigate(target)}
              >
                {target.kind === "route"
                  ? "Inspect connection →"
                  : "Inspect confirmation rule →"}
              </button>
            ))}
          {!navigationEnabled && (
            <small>Open the tested YAML to use these links.</small>
          )}
          {!canEditRules &&
            targets.some((target) => target.kind === "policy") && (
              <small>Stop the test to edit its confirmation rule.</small>
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
