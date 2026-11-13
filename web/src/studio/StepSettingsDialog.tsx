import { ActionInspector } from "./ActionInspector";
import { StepConnections } from "./StepConnections";
import { RouteInspector } from "./RouteInspector";
import { RetainedActionSettings } from "./RetainedActionSettings";
import type { ToolManifest } from "./tool-manifest";
import type { RouteRef } from "./types";
import { readWorkflow } from "../workflow";
import { useRef, useState } from "react";
import { Select } from "../ui/Select";
import { voiceEngine } from "../voice-config";
import {
  SettingsDialog,
  Choices,
  useSettingsDraft,
  friendlyName,
} from "./SettingsDialog";
import { ConfirmationFields, DefinitionActions } from "./ConfirmationFields";
import { readbackTokens, validateStep } from "./settings-edits";
import type { DocumentTransaction, StudioMetadata } from "./types";

export function StepSettingsDialog({
  source,
  metadata,
  nodeId: initialId,
  initialRule = false,
  onSave,
  onClose,
  tools = [],
}: {
  source: string;
  metadata: StudioMetadata;
  nodeId: string;
  initialRule?: boolean;
  tools?: ToolManifest[];
  onSave: (transaction: DocumentTransaction, nodeId: string | null) => void;
  onClose: () => void;
}) {
  const draft = useSettingsDraft(source, metadata),
    w = draft.workflow;
  const [nodeId, setNodeId] = useState(initialId),
    [editRule, setEditRule] = useState(initialRule),
    [detail, setDetail] = useState(""),
    [connection, setConnection] = useState<RouteRef | null>(null);
  const readback = useRef<HTMLTextAreaElement>(null);
  const node =
    w && Object.hasOwn(w.nodes, nodeId) ? w.nodes[nodeId] : undefined;
  if (!node)
    return (
      <SettingsDialog
        title="Remove this step?"
        viewKey="remove"
        label="Step settings"
        description="The change stays staged until you save."
        saveLabel="Remove step"
        error={draft.error}
        onClose={onClose}
        onSave={() => {
          try {
            draft.save("Remove step", (transaction) =>
              onSave(transaction, null),
            );
            onClose();
          } catch (error) {
            draft.setError((error as Error).message);
          }
        }}
      >
        <p>
          <code>{nodeId}</code> will be removed when you save. Cancel keeps the
          original workflow.
        </p>
      </SettingsDialog>
    );
  const change = (key: string, value: unknown) =>
    draft.set(["nodes", nodeId, key], value);
  const binding = (key: string, value: string) =>
    value
      ? change(key, value)
      : draft.apply({
          label: "Clear binding",
          operations: [{ op: "delete", path: ["nodes", nodeId, key] }],
        });
  const actions = Object.entries(w.nodes)
    .filter(
      ([, n]) =>
        n.kind === "action" &&
        n.confirmation &&
        n.confirmation === node.confirmation,
    )
    .map(([id, n]) => n.title || id);
  let tokens: ReturnType<typeof readbackTokens> = [];
  try {
    tokens = readbackTokens(node.readback || "");
  } catch {
    /* Keep invalid text editable until Save explains it. */
  }
  return (
    <SettingsDialog
      title={
        editRule
          ? `Confirm before ${actions.join(", ") || "an action"}`
          : node.title || nodeId
      }
      label="Step settings"
      viewKey={editRule ? "rule" : connection ? "connection" : "step"}
      description={
        node.confirmation && node.kind === "conversation"
          ? "Read the current details back and wait for the caller’s approval."
          : "Choose how this step behaves within your workflow."
      }
      saveLabel="Save step"
      error={draft.error}
      onClose={onClose}
      onSave={() => {
        try {
          validateStep(w, nodeId);
          draft.save("Edit step settings", (transaction) =>
            onSave(transaction, nodeId),
          );
          onClose();
        } catch (error) {
          draft.setError((error as Error).message);
        }
      }}
    >
      {connection ? (
        <>
          <button type="button" onClick={() => setConnection(null)}>
            ← Back to step settings
          </button>
          <RouteInspector
            source={draft.source}
            workflow={w}
            route={connection}
            tools={tools}
            metadata={draft.metadata}
            onTransaction={draft.apply}
            onRenamed={(edgeId) => setConnection({ ...connection, edgeId })}
            onRemoved={() => setConnection(null)}
          />
        </>
      ) : editRule && node.confirmation ? (
        <>
          <button type="button" onClick={() => setEditRule(false)}>
            ← Back to step settings
          </button>
          <ConfirmationFields draft={draft} id={node.confirmation} />
        </>
      ) : (
        <>
          <label>
            Step name
            <input
              value={node.title || ""}
              onChange={(event) => change("title", event.target.value)}
            />
          </label>
          {node.kind === "conversation" && (
            <fieldset className="entry-options">
              <legend>When this step starts</legend>
              <label>
                <input
                  type="radio"
                  name="step-entry"
                  checked={(node.entry || "wait") === "wait"}
                  disabled={!!node.confirmation || !!node.readback}
                  onChange={() => change("entry", "wait")}
                />
                Wait for the caller
              </label>
              <label>
                <input
                  type="radio"
                  name="step-entry"
                  checked={node.entry === "respond"}
                  onChange={() => change("entry", "respond")}
                />
                Speak first
              </label>
              {(node.confirmation || node.readback) && (
                <p>This readback step speaks first to read the details back.</p>
              )}
            </fieldset>
          )}
          {node.kind === "conversation" &&
            (node.confirmation || node.readback) && (
              <>
                <label>
                  Read these details back
                  <textarea
                    ref={readback}
                    rows={5}
                    value={node.readback || ""}
                    onChange={(event) => change("readback", event.target.value)}
                  />
                </label>
                <div className="insert-detail">
                  <label>
                    Insert detail
                    <Select
                      value={detail}
                      onChange={(event) => setDetail(event.target.value)}
                    >
                      <option value="">Choose a field…</option>
                      {Object.keys(w.fields || {}).map((id) => (
                        <option key={id} value={id}>
                          {friendlyName(id)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <button
                    type="button"
                    className="button"
                    disabled={!detail}
                    onClick={() => {
                      const input = readback.current;
                      const text = node.readback || "";
                      const start = input?.selectionStart ?? text.length,
                        end = input?.selectionEnd ?? start;
                      change(
                        "readback",
                        text.slice(0, start) + `{${detail}}` + text.slice(end),
                      );
                      input?.focus();
                    }}
                  >
                    Insert
                  </button>
                </div>
                <div
                  className="readback-field-preview"
                  aria-label="Readback details"
                >
                  {[...new Set(tokens.map((token) => token.field))].map(
                    (id) => (
                      <span key={id} title={`{${id}}`}>
                        {friendlyName(id)}
                      </span>
                    ),
                  )}
                </div>
                <p>
                  Details in blue use the current task’s values. Braces in the
                  message refer to stable field IDs.
                </p>
              </>
            )}
          {node.kind === "conversation" && !node.confirmation && (
            <label>
              Step prompt
              <textarea
                rows={4}
                value={node.prompt || ""}
                onChange={(event) => change("prompt", event.target.value)}
              />
            </label>
          )}
          {node.kind === "say" && (
            <label>
              Exact message
              <textarea
                rows={5}
                value={node.text || ""}
                onChange={(event) => change("text", event.target.value)}
              />
            </label>
          )}
          {node.confirmation && (
            <section className="settings-rule-summary">
              <p>
                The caller’s approval is required
                {actions.length
                  ? ` before ${actions.join(", ")} can run`
                  : " by this rule"}
                .
              </p>
              <button type="button" onClick={() => setEditRule(!editRule)}>
                Edit rule
              </button>
            </section>
          )}
          {node.kind === "action" ? (
            <section aria-label="Action configuration">
              <h3>Action configuration</h3>
              <p>
                Apply the input and outcome configuration here, then Save step
                to commit the whole conversion.
              </p>
              <ActionInspector
                source={draft.source}
                workflow={w}
                nodeId={nodeId}
                tools={tools}
                replaceConnections={
                  readWorkflow(source)?.nodes[initialId]?.kind !== "action"
                }
                onPendingChange={(pending) =>
                  draft.markPending("action-configuration", pending)
                }
                onTransaction={draft.apply}
              />
            </section>
          ) : (
            <section aria-label="Step connections">
              <h3>
                {node.kind === "end"
                  ? "Retained connections · inactive"
                  : "Connections"}
              </h3>
              <StepConnections
                source={draft.source}
                workflow={w}
                nodeId={nodeId}
                tools={tools}
                allowInsert={false}
                onSelect={(selection) => {
                  if (selection.kind === "edge")
                    setConnection({
                      source: selection.source,
                      edgeId: selection.edgeId,
                    });
                }}
                onTransaction={draft.apply}
              />
            </section>
          )}
          {node.kind !== "action" && (
            <RetainedActionSettings
              key={nodeId}
              draft={draft}
              nodeId={nodeId}
            />
          )}
          <details>
            <summary>
              More options · Knowledge, tools and advanced settings
            </summary>
            {node.kind === "conversation" && node.confirmation && (
              <label>
                Step prompt
                <textarea
                  rows={4}
                  value={node.prompt || ""}
                  onChange={(event) => change("prompt", event.target.value)}
                />
              </label>
            )}
            <DefinitionActions
              key={nodeId}
              draft={draft}
              kind="nodes"
              id={nodeId}
              onRenamed={setNodeId}
            />
            <label>
              Step kind
              <Select
                value={node.kind}
                onChange={(event) =>
                  draft.apply({
                    label: "Change step kind",
                    operations: [
                      {
                        op: "set",
                        path: ["nodes", nodeId, "kind"],
                        value: event.target.value,
                      },
                      ...(!node.edges && event.target.value !== "end"
                        ? [
                            {
                              op: "set" as const,
                              path: ["nodes", nodeId, "edges"],
                              value: [],
                            },
                          ]
                        : []),
                    ],
                  })
                }
              >
                {["conversation", "action", "say", "end"].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </Select>
            </label>
            <p>
              Changing kind preserves existing properties. Incompatible readback
              or task bindings must be cleared explicitly.
            </p>
            <label>
              Start a new task here
              <Select
                value={node.begin_request || ""}
                onChange={(event) =>
                  binding("begin_request", event.target.value)
                }
              >
                <option value="">None</option>
                {Object.keys(w.requests || {}).map((id) => (
                  <option key={id} value={id}>
                    {friendlyName(id)}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Confirmation rule
              <Select
                value={node.confirmation || ""}
                onChange={(event) =>
                  binding("confirmation", event.target.value)
                }
              >
                <option value="">None</option>
                {Object.keys(w.confirmations || {}).map((id) => (
                  <option key={id} value={id}>
                    {friendlyName(id)}
                  </option>
                ))}
              </Select>
            </label>
            <Choices
              legend="Step knowledge"
              values={Object.keys(w.knowledge || {})}
              selected={node.knowledge || []}
              onChange={(value) => change("knowledge", value)}
            />
            <Choices
              legend="Available tools in this step"
              values={w.tools || []}
              selected={node.tools || []}
              onChange={(value) => change("tools", value)}
            />
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={node.patient || false}
                onChange={(event) => change("patient", event.target.checked)}
              />
              Allow more time for the caller
            </label>
            {(voiceEngine(w.speech) === "livekit" ||
              node.kind !== "conversation") && (
              <p>
                Patient tuning is inactive for this integration or step kind.
                Its YAML value is retained.
              </p>
            )}
            <details>
              <summary>Retained message settings</summary>
              <p>
                Properties unused by this kind are retained; retaining a value
                does not make it effective.
              </p>
              {node.kind !== "conversation" && (
                <label>
                  Retained prompt
                  <textarea
                    value={node.prompt || ""}
                    onChange={(event) => change("prompt", event.target.value)}
                  />
                </label>
              )}
              {node.kind !== "say" && (
                <label>
                  Retained exact message
                  <textarea
                    value={node.text || ""}
                    onChange={(event) => change("text", event.target.value)}
                  />
                </label>
              )}
              {!node.confirmation && (
                <label>
                  Readback template
                  <textarea
                    value={node.readback || ""}
                    onChange={(event) => change("readback", event.target.value)}
                  />
                </label>
              )}
              {node.kind !== "conversation" && (
                <label>
                  Retained entry behavior
                  <Select
                    value={node.entry || "wait"}
                    onChange={(event) => change("entry", event.target.value)}
                  >
                    <option value="wait">Wait for the caller</option>
                    <option value="respond">Speak first</option>
                  </Select>
                </label>
              )}
            </details>
          </details>
        </>
      )}
    </SettingsDialog>
  );
}
