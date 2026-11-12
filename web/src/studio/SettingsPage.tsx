import { ControllerInstructions } from "./ControllerInstructions";
import { ModelPicker } from "./ModelPicker";
import { ReasoningControl } from "./ReasoningControl";
import { createStudioApi } from "./runtime-api";
import { modelDefaults, type ModelCatalog } from "./model-catalog";
import { DefinitionActions } from "./ConfirmationFields";
import { definitionUses } from "./settings-edits";
import { ConversationEditor } from "./ConversationEditor";
import { voiceEngine, voicePresets } from "../voice-config";
import { Select } from "../ui/Select";
import { useEffect, useRef, useState } from "react";
import { readWorkflow, type Workflow } from "../workflow";
import type { StudioDocument, DocumentTransaction } from "./types";
import type { StudioCapabilities } from "./runtime-api";
import { fieldReferences } from "./field-references";
export function SettingsPage({
  document,
  capabilities,
  onTransaction,
  onConnection,
  onStep,
  onHistoryEnd,
  category = "agent",
  onWorkflow,
}: {
  category?: "agent" | "fields" | "tools";
  onWorkflow: () => void;
  document: StudioDocument;
  capabilities: StudioCapabilities | null;
  onTransaction: (tx: DocumentTransaction) => void;
  onConnection: () => void;
  onStep: (id: string) => void;
  onHistoryEnd: () => void;
}) {
  const [agentSection, setAgentSection] = useState("conversation"),
    [error, setError] = useState(""),
    [newField, setNewField] = useState(""),
    [newType, setNewType] = useState("string");
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
  const speech: NonNullable<Workflow["speech"]> =
    workflow.speech || voicePresets.livekit;
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
      className={`settings-page agent-page ${category === "agent" ? "agent-settings" : ""}`}
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
                <section>
                  <h3>Speech</h3>
                  <label>
                    Voice integration
                    <Select
                      value={voiceEngine(workflow.speech)}
                      onChange={(event) => {
                        const preset =
                          voicePresets[
                            event.target.value as "livekit" | "direct"
                          ];
                        onTransaction({
                          label: "Change voice integration",
                          operations: Object.entries(preset).map(
                            ([key, value]) => ({
                              op: "set" as const,
                              path: ["speech", key],
                              value,
                            }),
                          ),
                        });
                      }}
                    >
                      <option value="livekit">LiveKit Agents</option>
                      <option value="direct">Direct Deepgram</option>
                    </Select>
                  </label>
                  {voiceEngine(workflow.speech) === "livekit" && (
                    <label>
                      Speech credentials
                      <Select
                        value={workflow.speech?.credential_mode || "inference"}
                        onChange={(event) =>
                          change(
                            ["speech", "credential_mode"],
                            event.target.value,
                          )
                        }
                      >
                        <option value="inference">
                          LiveKit Inference · LiveKit credentials
                        </option>
                        <option value="providers">
                          Direct plugins · individual provider keys
                        </option>
                      </Select>
                    </label>
                  )}
                  {(["stt", "tts"] as const).map((role) => {
                    const current = speech[role];
                    const choices =
                      capabilities?.speechChoices.filter(
                        (s) =>
                          s.role === role &&
                          (!s.engine ||
                            s.engine === voiceEngine(workflow.speech)),
                      ) || [];
                    return (
                      <label key={role}>
                        {role === "stt" ? "Speech recognition" : "Voice output"}
                        <Select
                          value={JSON.stringify(current || null)}
                          onChange={(e) => {
                            const endpoint = JSON.parse(e.target.value);
                            if (
                              role === "tts" &&
                              endpoint.provider === "cartesia"
                            )
                              endpoint.voice =
                                current?.voice ||
                                voicePresets.livekit.tts.voice;
                            change(["speech", role], endpoint);
                          }}
                        >
                          {current && (
                            <option value={JSON.stringify(current)}>
                              {current.provider} / {current.model}
                            </option>
                          )}
                          {choices
                            .filter(
                              (c) =>
                                c.provider !== current?.provider ||
                                c.model !== current?.model,
                            )
                            .map((c) => (
                              <option
                                key={JSON.stringify(c)}
                                value={JSON.stringify({
                                  provider: c.provider,
                                  model: c.model,
                                })}
                              >
                                {c.provider} / {c.model}
                              </option>
                            ))}
                        </Select>
                      </label>
                    );
                  })}
                  {speech.tts?.provider === "cartesia" && (
                    <label>
                      Voice ID
                      <input
                        value={speech.tts.voice || ""}
                        onChange={(event) =>
                          change(
                            ["speech", "tts", "voice"],
                            event.target.value,
                            "settings:voice",
                          )
                        }
                      />
                    </label>
                  )}
                  <label>
                    Recognition hints · one per line
                    <LineList
                      value={workflow.speech?.hints || []}
                      onCommit={(value) =>
                        change(["speech", "hints"], value, "settings:hints")
                      }
                    />
                  </label>
                </section>
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
          ) : section === "fields" || section === "tools" ? (
            <>
              {section === "fields" && (
                <section>
                  <h3>Information fields</h3>
                  {Object.entries(workflow.fields || {}).map(([id, field]) => {
                    const refs = fieldReferences(workflow, id);
                    const uses = definitionUses(workflow, "fields", id);
                    return (
                      <details className="settings-field" key={id}>
                        <summary>
                          <strong>{id}</strong>
                          <span>
                            {field.type || "string"} · {uses.length} references
                          </span>
                        </summary>
                        <label>
                          Description
                          <input
                            value={field.description || ""}
                            onChange={(e) =>
                              change(
                                ["fields", id, "description"],
                                e.target.value,
                                `field:${id}:description`,
                              )
                            }
                          />
                        </label>
                        <label>
                          Type
                          <Select
                            value={field.type || "string"}
                            disabled={uses.length > 0}
                            title={
                              uses.length
                                ? "Update or remove the references below before changing this field type."
                                : undefined
                            }
                            onChange={(e) =>
                              change(["fields", id, "type"], e.target.value)
                            }
                          >
                            <option>string</option>
                            <option>boolean</option>
                          </Select>
                        </label>
                        {uses.length > 0 && (
                          <p>
                            Update or remove the references below before
                            changing this field type.
                          </p>
                        )}
                        {(field.type || "string") === "string" && (
                          <label>
                            Allowed choices · one per line
                            <LineList
                              value={field.choices || []}
                              onCommit={(value) =>
                                change(
                                  ["fields", id, "choices"],
                                  value,
                                  `field:${id}:choices`,
                                )
                              }
                            />
                          </label>
                        )}
                        <p>Used by</p>
                        {refs.length ? (
                          refs.map((ref, i) => (
                            <button
                              className="field-reference"
                              key={i}
                              onClick={() => onStep(ref.nodeId)}
                            >
                              {workflow.nodes[ref.nodeId].title || ref.nodeId} ·{" "}
                              {ref.kind} →
                            </button>
                          ))
                        ) : (
                          <p>No structured references.</p>
                        )}
                        <p>
                          {uses.length
                            ? `Structured uses: ${uses.join(", ")}`
                            : "No task or rule references."}
                        </p>
                        <DefinitionActions
                          kind="fields"
                          id={id}
                          draft={{
                            source: document.source,
                            metadata: document.metadata,
                            workflow,
                            setError,
                            apply: (transaction) => {
                              onTransaction(transaction);
                              return true;
                            },
                          }}
                        />
                      </details>
                    );
                  })}
                  <div className="settings-add-field">
                    <label>
                      New field ID
                      <input
                        value={newField}
                        onChange={(e) => setNewField(e.target.value)}
                      />
                    </label>
                    <Select
                      aria-label="New field type"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value)}
                    >
                      <option>string</option>
                      <option>boolean</option>
                    </Select>
                    <button
                      className="button"
                      onClick={() => {
                        if (
                          !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(newField) ||
                          Object.hasOwn(workflow.fields || {}, newField)
                        ) {
                          setError(
                            "Choose a new field ID starting with a letter.",
                          );
                          return;
                        }
                        change(["fields", newField], { type: newType });
                        setNewField("");
                      }}
                    >
                      Add field
                    </button>
                  </div>
                </section>
              )}
              {section === "tools" && (
                <section>
                  <h3>Registered tools</h3>
                  <p>
                    YAML references registered implementations. It does not
                    create executable tools.
                  </p>
                  {capabilities?.tools.map((tool) => (
                    <details className="settings-field" key={tool.name}>
                      <summary>
                        {tool.name}
                        {workflow.tools?.includes(tool.name)
                          ? " · enabled"
                          : " · available"}
                      </summary>
                      <p>
                        Parameters:{" "}
                        {tool.parameters
                          .map(
                            (p) =>
                              `${p.name} (${p.type}${p.required ? ", required" : ""})`,
                          )
                          .join(", ")}
                      </p>
                      <p>Results: {tool.results.join(", ")}</p>
                    </details>
                  ))}
                  {capabilities?.limitations?.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </section>
              )}
            </>
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

function LineList({
  value,
  onCommit,
}: {
  value: string[];
  onCommit: (value: string[]) => void;
}) {
  const serialized = value.join("\n");
  const [text, setText] = useState(serialized);
  useEffect(() => setText(serialized), [serialized]);
  return (
    <textarea
      rows={4}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() =>
        onCommit(
          text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        )
      }
    />
  );
}
