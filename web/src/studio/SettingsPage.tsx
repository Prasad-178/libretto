import { SpeechSettings } from "./SpeechSettings";
import { ControllerInstructions } from "./ControllerInstructions";
import { ModelPicker } from "./ModelPicker";
import { ReasoningControl } from "./ReasoningControl";
import { createStudioApi } from "./runtime-api";
import { modelDefaults, type ModelCatalog } from "./model-catalog";
import { CollectedDataPage } from "./CollectedDataPage";
import { ToolsPage } from "./ToolsPage";
import { ConversationEditor } from "./ConversationEditor";
import { useEffect, useRef, useState } from "react";
import { readWorkflow } from "../workflow";
import type { StudioDocument, DocumentTransaction } from "./types";
import type { StudioCapabilities } from "./runtime-api";
export function SettingsPage({
  document,
  capabilities,
  onTransaction,
  onConnection,
  onStep,
  onHistoryEnd,
  category = "agent",
  onWorkflow,
  cartesiaKey = "",
}: {
  category?: "agent" | "fields" | "tools";
  cartesiaKey?: string;
  onWorkflow: () => void;
  document: StudioDocument;
  capabilities: StudioCapabilities | null;
  onTransaction: (tx: DocumentTransaction) => void;
  onConnection: () => void;
  onStep: (id: string) => void;
  onHistoryEnd: () => void;
}) {
  const [agentSection, setAgentSection] = useState("conversation"),
    [error, setError] = useState("");
  const section = category === "agent" ? agentSection : category;
  const setSection = (next: string) => {
    onHistoryEnd();
    setAgentSection(next);
  };
  const historyEnd = useRef(onHistoryEnd);
  historyEnd.current = onHistoryEnd;
  useEffect(() => () => historyEnd.current(), []);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const needsCatalog = section === "models" || section === "controller";
  useEffect(() => {
    if (!needsCatalog) return;
    const abort = new AbortController();
    setCatalogLoading(true);
    createStudioApi("")
      .models(abort.signal)
      .then(setCatalog)
      .catch(() => {
        if (!abort.signal.aborted) setCatalog(null);
      })
      .finally(() => {
        if (!abort.signal.aborted) setCatalogLoading(false);
      });
    return () => abort.abort();
  }, [needsCatalog, catalogRevision]);
  const workflow = readWorkflow(document.source);
  if (!workflow)
    return (
      <p className="workspace-help">
        Fix the YAML syntax before editing settings.
      </p>
    );
  const change = (
    path: (string | number)[],
    value: unknown,
    group?: string,
  ) => {
    try {
      onTransaction({
        label: "Edit settings",
        historyGroup: group,
        operations: [{ op: "set", path, value }],
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const sections = [
    { id: "conversation", label: "Conversation" },
    { id: "controller", label: "Stage controller" },
    { id: "speech", label: "Speech" },
  ];
  const title =
    category === "fields"
      ? "Collected data"
      : category === "tools"
        ? "Tools"
        : section === "models"
          ? "Models"
          : sections.find((s) => s.id === section)?.label;
  return (
    <section
      className={`settings-page agent-page ${category === "agent" ? "agent-settings" : ""} ${section === "speech" ? "speech-page" : ""} ${category !== "agent" ? "definition-browser-page" : ""}`}
      aria-label="Workflow settings"
      onBlur={onHistoryEnd}
    >
      <div className="settings-content">
        <header className="agent-page-header">
          <h2>{title}</h2>
          <p>
            {category === "fields"
              ? "Define the information your agent collects and where it is used."
              : category === "tools"
                ? "Inspect the actions registered by your application."
                : section === "conversation"
                  ? "Define who your agent is and how it starts a conversation."
                  : section === "controller"
                    ? "Configure how your workflow interprets information and chooses its next step."
                    : section === "speech"
                      ? "Choose how your agent listens and speaks."
                      : "Choose the models that respond and interpret your workflow."}
          </p>
          {category === "agent" && (
            <nav className="agent-section-tabs" aria-label="Agent settings">
              {sections.map((item) => (
                <button
                  key={item.id}
                  aria-current={section === item.id ? "page" : undefined}
                  className={section === item.id ? "selected" : ""}
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}
        </header>
        {error && (
          <p className="inspector-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={!!document.running}>
          {section === "conversation" ? (
            <ConversationEditor
              workflow={workflow}
              disabled={!!document.running}
              change={change}
              onHistoryEnd={onHistoryEnd}
              onSection={setSection}
              onWorkflow={onWorkflow}
            />
          ) : section === "models" || section === "speech" ? (
            <>
              {section === "models" && (
                <div className="model-settings-layout">
                  <div className="model-settings-main">
                    <ModelPicker
                      role="response"
                      value={workflow.models?.speaker || modelDefaults.speaker}
                      catalog={catalog}
                      loading={catalogLoading}
                      disabled={!!document.running}
                      onChange={(id) => change(["models", "speaker"], id)}
                      onRetry={() => setCatalogRevision((n) => n + 1)}
                    />
                    <ReasoningControl
                      model={catalog?.models.find(
                        (m) =>
                          m.id ===
                          (workflow.models?.speaker || modelDefaults.speaker),
                      )}
                      value={workflow.models?.reasoning || "minimal"}
                      disabled={!!document.running}
                      onChange={(value) =>
                        change(["models", "reasoning"], value)
                      }
                    />
                  </div>
                  <aside className="model-settings-help">
                    <h3>Model-specific controls</h3>
                    <p>
                      Effort levels and reported defaults come from OpenRouter.
                      Model selection preserves your existing effort setting.
                    </p>
                    <p>
                      Catalog rates are USD per million tokens, before
                      additional provider charges. Unknown prices are shown
                      explicitly.
                    </p>
                    <button onClick={() => setSection("controller")}>
                      Open stage controller →
                    </button>
                  </aside>
                </div>
              )}
              {section === "speech" && (
                <SpeechSettings
                  workflow={workflow}
                  capabilities={capabilities}
                  disabled={!!document.running}
                  change={change}
                  onTransaction={onTransaction}
                  onConnection={onConnection}
                  onHistoryEnd={onHistoryEnd}
                  cartesiaKey={cartesiaKey}
                />
              )}
            </>
          ) : section === "controller" ? (
            <section>
              <ModelPicker
                role="controller"
                value={workflow.models?.evaluator || modelDefaults.evaluator}
                catalog={catalog}
                loading={catalogLoading}
                disabled={!!document.running}
                onChange={(id) => change(["models", "evaluator"], id)}
                onRetry={() => setCatalogRevision((n) => n + 1)}
              />
              <p>
                The stage controller requests minimal reasoning separately.
                Provider support varies; changing its model does not change that
                runtime setting.
              </p>
              <h3>Stage controller instructions</h3>
              <p>
                The controller interprets caller information and proposes
                transitions. It does not speak or execute tools. Libretto
                enforces the workflow rules.
              </p>
              <ControllerInstructions
                value={workflow.evaluation_prompt || ""}
                disabled={!!document.running}
                onChange={(value) =>
                  change(
                    ["evaluation_prompt"],
                    value,
                    "settings:evaluation-prompt",
                  )
                }
                onHistoryEnd={onHistoryEnd}
              />
              <button className="button" onClick={() => setSection("models")}>
                Model settings →
              </button>
            </section>
          ) : section === "fields" ? (
            <CollectedDataPage
              workflow={workflow}
              document={document}
              onTransaction={onTransaction}
              onStep={onStep}
            />
          ) : section === "tools" ? (
            <ToolsPage
              workflow={workflow}
              tools={capabilities?.tools || []}
              onStep={onStep}
              onWorkflow={onWorkflow}
            />
          ) : (
            <section>
              <h3>Runtime connection</h3>
              <p>
                Studio currently uses the runtime serving this page. Test
                credentials stay in session memory and are excluded from draft
                storage and exports.
              </p>
              <button className="button" onClick={onConnection}>
                Configure test connection
              </button>
            </section>
          )}
        </fieldset>
      </div>
    </section>
  );
}
