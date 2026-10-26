import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  UserRound,
  Volume2,
} from "lucide-react";

export type TestScenario = {
  id: string;
  title: string;
  category: string;
  summary: string;
  fictional: boolean;
  transfer_outcome: "connected" | "unavailable" | "failed" | "timeout";
  opening: string;
  steps: { say: string; expect: string }[];
  checks: string[];
  expected_sources: string[];
  expected_tools: string[];
  voice_only: boolean;
  caller: { name: string; phone: string; organization: string } | null;
};

export function prepareScenario(scenario: TestScenario, step = 0) {
  if (!Number.isInteger(step) || !scenario.steps[step])
    throw new Error("Unknown scenario step");
  return {
    input: scenario.steps[step].say,
    transferOutcome: scenario.transfer_outcome,
    step,
  };
}

export function TestScenarios({
  scenarios,
  connected,
  connecting,
  activeId,
  onPrepare,
}: {
  scenarios: TestScenario[];
  connected: boolean;
  connecting: boolean;
  activeId: string | null;
  onPrepare: (scenario: TestScenario, step: number) => void;
}) {
  const [category, setCategory] = useState("All scenarios");
  const categories = Array.from(new Set(scenarios.map((s) => s.category)));
  return (
    <div className="scenarios-scroll">
      <div className="scenario-intro">
        <span className="scenario-intro-icon">
          <ClipboardList size={18} />
        </span>
        <h3>Try a real conversation</h3>
        <p>
          A fictional coworking front desk, with scripts for the questions and
          edge cases a receptionist handles.
        </p>
      </div>
      <div className="scenario-data-note">
        <BookOpen size={13} />
        <span>
          Fictional test data · no real customers
          <br />
          Preparation never starts a call or spends API credits.
        </span>
      </div>
      <label className="scenario-filter">
        Browse {scenarios.length} scenarios
        <select
          aria-label="Scenario category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>All scenarios</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {scenarios
        .filter((s) => category === "All scenarios" || s.category === category)
        .map((s) => {
          const blocked = connecting || (connected && activeId !== s.id);
          return (
            <details
              className={`scenario-card ${activeId === s.id ? "prepared" : ""}`}
              key={s.id}
              open={activeId === s.id}
            >
              <summary>
                <div>
                  <span className="scenario-category">
                    {s.category}
                    {s.voice_only && <Volume2 size={11} />}
                  </span>
                  <strong>{s.title}</strong>
                  <p>{s.summary}</p>
                </div>
                <ChevronDown size={13} />
              </summary>
              <div className="scenario-card-body">
                {s.caller && (
                  <div className="scenario-caller">
                    <UserRound size={14} />
                    <div>
                      <strong>{s.caller.name}</strong>
                      <span>{s.caller.phone}</span>
                      <span>{s.caller.organization}</span>
                    </div>
                  </div>
                )}
                <div className="scenario-outcome">
                  Simulated transfer <strong>{s.transfer_outcome}</strong>
                </div>
                {s.voice_only && (
                  <p className="scenario-voice-note">
                    Use voice mode. Interrupt while the agent is speaking.
                  </p>
                )}
                <button
                  className="button scenario-prepare"
                  disabled={blocked}
                  onClick={() => onPrepare(s, 0)}
                >
                  <ClipboardList size={12} />
                  {activeId === s.id
                    ? "Prepare first line"
                    : "Prepare scenario"}
                  <ArrowRight size={12} />
                </button>
                {blocked && (
                  <p className="scenario-locked">
                    End the current test before preparing a different scenario.
                  </p>
                )}
                <h4>Expected behavior</h4>
                {s.steps.map((step, i) => (
                  <div className="scenario-step" key={i}>
                    <span className="scenario-step-number">{i + 1}</span>
                    <div>
                      <p className="scenario-say">“{step.say}”</p>
                      <p className="scenario-expect">{step.expect}</p>
                      <button
                        disabled={blocked}
                        onClick={() => onPrepare(s, i)}
                      >
                        Use this line <ArrowRight size={10} />
                      </button>
                    </div>
                  </div>
                ))}
                <h4>Manual checks</h4>
                <ul className="scenario-checks">
                  {s.checks.map((check) => (
                    <li key={check}>
                      <Check size={11} />
                      {check}
                    </li>
                  ))}
                </ul>
                {!!s.expected_sources.length && (
                  <div className="scenario-sources">
                    <BookOpen size={11} />
                    {s.expected_sources.join(", ")}
                  </div>
                )}
                {!!s.expected_tools.length && (
                  <div className="scenario-tool-expectations">
                    <span>Expected receipts</span>
                    {s.expected_tools.map((tool) => (
                      <code key={tool}>{tool}</code>
                    ))}
                  </div>
                )}
                <p className="scenario-manual-note">
                  These are expected outcomes to inspect in State, Sources and
                  Trace. They are not automatically graded.
                </p>
              </div>
            </details>
          );
        })}
    </div>
  );
}
