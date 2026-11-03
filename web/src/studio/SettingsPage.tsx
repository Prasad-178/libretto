import { Select } from "../ui/Select";
import { useEffect, useRef, useState } from "react";
import { readWorkflow } from "../workflow";
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
}: {
  document: StudioDocument;
  capabilities: StudioCapabilities | null;
  onTransaction: (tx: DocumentTransaction) => void;
  onConnection: () => void;
  onStep: (id: string) => void;
  onHistoryEnd: () => void;
}) {
  const [section, setSection] = useState("conversation"),
    [error, setError] = useState(""),
    [newField, setNewField] = useState(""),
    [newType, setNewType] = useState("string");
  const historyEnd = useRef(onHistoryEnd);
  historyEnd.current = onHistoryEnd;
  useEffect(() => () => historyEnd.current(), []);
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
    { id: "models", label: "Models & speech" },
    { id: "fields", label: "Fields & tools" },
    { id: "connection", label: "Test connection" },
  ];
  return (
    <section
      className="settings-page"
      aria-label="Workflow settings"
      onBlur={onHistoryEnd}
    >
      <aside className="settings-navigation">
        <h2>Settings</h2>
        <Select
          aria-label="Settings section"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <nav>
          {sections.map((s) => (
            <button
              key={s.id}
              className={section === s.id ? "selected" : ""}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="settings-content">
        <h2>{sections.find((s) => s.id === section)?.label}</h2>
        {error && (
          <p className="inspector-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={!!document.running}>
          {section === "conversation" ? (
            <>
              <section>
                <label>
                  Workflow name
                  <input
                    value={workflow.name}
                    onChange={(e) =>
                      change(["name"], e.target.value, "settings:name")
                    }
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={workflow.description || ""}
                    onChange={(e) =>
                      change(
                        ["description"],
                        e.target.value,
                        "settings:description",
                      )
                    }
                  />
                </label>
              </section>
              <section>
                <h3>Shared instructions</h3>
                <p>These instructions apply throughout the conversation.</p>
                <textarea
                  aria-label="Shared instructions"
                  rows={10}
                  value={workflow.shared_prompt}
                  onChange={(e) =>
                    change(
                      ["shared_prompt"],
                      e.target.value,
                      "settings:shared-prompt",
                    )
                  }
                />
              </section>
              <section>
                <label>
                  Welcome message
                  <textarea
                    rows={3}
                    value={workflow.welcome || ""}
                    onChange={(e) =>
                      change(["welcome"], e.target.value, "settings:welcome")
                    }
                  />
                </label>
                <label>
                  Start step
                  <Select
                    value={workflow.start}
                    onChange={(e) => change(["start"], e.target.value)}
                  >
                    {Object.entries(workflow.nodes).map(([id, n]) => (
                      <option key={id} value={id}>
                        {n.title || id}
                      </option>
                    ))}
                  </Select>
                </label>
              </section>
            </>
          ) : section === "models" ? (
            <>
              <section>
                <h3>Language models</h3>
                {(
                  [
                    {
                      role: "response",
                      key: "speaker",
                      label: "Response model",
                    },
                    {
                      role: "evaluator",
                      key: "evaluator",
                      label: "Evaluator model",
                    },
                  ] as const
                ).map(({ role, key, label }) => (
                  <label key={key}>
                    {label}
                    <Select
                      value={workflow.models?.[key] || ""}
                      onChange={(e) => change(["models", key], e.target.value)}
                    >
                      {[
                        ...new Set([
                          workflow.models?.[key] || "",
                          ...(capabilities?.modelChoices
                            .filter((m) => m.role === role)
                            .map((m) => m.id) || []),
                        ]),
                      ]
                        .filter(Boolean)
                        .map((id) => (
                          <option key={id}>{id}</option>
                        ))}
                    </Select>
                  </label>
                ))}
                <p>
                  Available choices come from the connected runtime
                  configuration.
                </p>
                <label>
                  Response reasoning
                  <Select
                    value={workflow.models?.reasoning || "minimal"}
                    onChange={(e) =>
                      change(["models", "reasoning"], e.target.value)
                    }
                  >
                    {["minimal", "low", "medium", "high"].map((level) => (
                      <option key={level}>{level}</option>
                    ))}
                  </Select>
                </label>
                <p>The evaluator uses minimal reasoning separately.</p>
              </section>
              <section>
                <h3>Speech</h3>
                {(["stt", "tts"] as const).map((role) => {
                  const current = workflow.speech?.[role];
                  const choices =
                    capabilities?.speechChoices.filter(
                      (s) => s.role === role,
                    ) || [];
                  return (
                    <label key={role}>
                      {role === "stt" ? "Speech recognition" : "Voice output"}
                      <Select
                        value={JSON.stringify(current || null)}
                        onChange={(e) =>
                          change(["speech", role], JSON.parse(e.target.value))
                        }
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
            </>
          ) : section === "fields" ? (
            <>
              <section>
                <h3>Information fields</h3>
                {Object.entries(workflow.fields || {}).map(([id, field]) => {
                  const refs = fieldReferences(workflow, id);
                  return (
                    <details className="settings-field" key={id}>
                      <summary>
                        <strong>{id}</strong>
                        <span>
                          {field.type} · {refs.length} references
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
                          value={field.type}
                          disabled={refs.length > 0}
                          title={
                            refs.length
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
                      {refs.length > 0 && (
                        <p>
                          Update or remove the references below before changing
                          this field type.
                        </p>
                      )}
                      {field.type === "string" && (
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
                      <button
                        disabled={!!refs.length}
                        onClick={() =>
                          onTransaction({
                            label: "Remove unused field",
                            operations: [
                              { op: "delete", path: ["fields", id] },
                            ],
                          })
                        }
                      >
                        Remove unused field
                      </button>
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
              <section>
                <h3>Registered tools</h3>
                <p>
                  YAML references registered implementations. It does not create
                  executable tools.
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
