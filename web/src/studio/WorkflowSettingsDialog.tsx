import { useState } from "react";
import { Select } from "../ui/Select";
import {
  SettingsDialog,
  Choices,
  useSettingsDraft,
  friendlyName,
} from "./SettingsDialog";
import { ConfirmationFields, DefinitionActions } from "./ConfirmationFields";
import { confirmationEdit, requestEdit } from "./settings-edits";
import type { DocumentTransaction, StudioMetadata } from "./types";
import type { ToolManifest } from "./tool-manifest";

export function WorkflowSettingsDialog({
  source,
  metadata,
  tools,
  onSave,
  onClose,
}: {
  source: string;
  metadata: StudioMetadata;
  tools: ToolManifest[];
  onSave: (transaction: DocumentTransaction) => void;
  onClose: () => void;
}) {
  const draft = useSettingsDraft(source, metadata),
    w = draft.workflow;
  const [newRequest, setRequest] = useState(""),
    [newRule, setRule] = useState(""),
    [activeRule, setActiveRule] = useState("");
  const [ruleRequest, setRuleRequest] = useState(""),
    [approval, setApproval] = useState(""),
    [protectedFields, setProtectedFields] = useState<string[]>([]);
  if (!w) return null;
  const focusedRule =
    activeRule && Object.hasOwn(w.confirmations || {}, activeRule)
      ? activeRule
      : "";
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      draft.setError((error as Error).message);
    }
  };
  return (
    <SettingsDialog
      title={
        focusedRule ? "Confirm before an action runs" : "Workflow settings"
      }
      viewKey={focusedRule || "workflow"}
      label="Workflow settings"
      description="Name your workflow and choose how conversations begin."
      saveLabel="Save workflow"
      error={draft.error}
      onClose={onClose}
      onSave={() =>
        attempt(() => {
          if (newRequest.trim() || newRule.trim())
            throw new Error("Add or clear the new task/rule ID before saving.");
          if (!draft.workflow.name.trim())
            throw new Error("Enter a workflow name.");
          draft.save("Edit workflow settings", onSave);
          onClose();
        })
      }
    >
      {focusedRule ? (
        <>
          <button type="button" onClick={() => setActiveRule("")}>
            ← Back to workflow settings
          </button>
          <ConfirmationFields draft={draft} id={focusedRule} />
        </>
      ) : (
        <>
          <label>
            Workflow name
            <input
              value={w.name}
              onChange={(event) => draft.set(["name"], event.target.value)}
            />
          </label>
          <label>
            What does it help with?
            <textarea
              rows={2}
              value={w.description || ""}
              onChange={(event) =>
                draft.set(["description"], event.target.value)
              }
              aria-describedby="workflow-description-help"
            />
          </label>
          <p id="workflow-description-help">
            For your reference; doesn’t affect agent behaviour.
          </p>
          <label>
            Conversation starts at
            <Select
              value={w.start}
              onChange={(event) => draft.set(["start"], event.target.value)}
            >
              {Object.entries(w.nodes).map(([id, node]) => (
                <option key={id} value={id}>
                  {node.title || id}
                </option>
              ))}
            </Select>
          </label>
          <p>The first step after the welcome message.</p>
          <section>
            <h3>Before actions run</h3>
            {Object.entries(w.confirmations || {}).map(([id, rule]) => (
              <div className="settings-rule-summary" key={id}>
                <div>
                  <strong>
                    {Object.entries(w.nodes)
                      .filter(
                        ([, node]) =>
                          node.kind === "action" && node.confirmation === id,
                      )
                      .map(([key, node]) => node.title || key)
                      .join(", ") || friendlyName(id)}
                  </strong>
                  <p>
                    Caller must confirm{" "}
                    {rule.fields.map(friendlyName).join(", ")}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRule(activeRule === id ? "" : id)}
                >
                  Edit rule →
                </button>
              </div>
            ))}
            {!Object.keys(w.confirmations || {}).length && (
              <p>
                No confirmation rules configured. Add a rule in Advanced when
                your workflow needs one.
              </p>
            )}
          </section>
          <details>
            <summary>Advanced · IDs, available tools and task memory</summary>
            <label>
              Workflow ID
              <input
                value={w.id}
                onChange={(event) => draft.set(["id"], event.target.value)}
              />
            </label>
            <label>
              Schema version
              <Select
                value={String(w.version ?? "")}
                onChange={() => draft.set(["version"], 1)}
              >
                <option value="1">1</option>
              </Select>
            </label>
            <Choices
              legend="Available registered tools"
              values={tools.map((tool) => tool.name)}
              selected={w.tools || []}
              onChange={(value) => draft.set(["tools"], value)}
            />
            <Choices
              legend="Shared knowledge"
              values={Object.keys(w.knowledge || {})}
              selected={w.common_knowledge || []}
              onChange={(value) => draft.set(["common_knowledge"], value)}
            />
            <h3>Task memory</h3>
            <p>
              These fields belong to one request. Starting it again creates
              fresh request state; fields cannot belong to two tasks.
            </p>
            {Object.entries(w.requests || {}).map(([id, request]) => (
              <details key={id}>
                <summary>
                  {friendlyName(id)} · {(request.fields || []).length} fields
                </summary>
                <Choices
                  legend={`Fields kept for ${id}`}
                  values={Object.keys(w.fields || {})}
                  selected={request.fields || []}
                  onChange={(value) =>
                    attempt(() => {
                      draft.set(["requests", id, "fields"], value);
                    })
                  }
                />
                <DefinitionActions draft={draft} kind="requests" id={id} />
              </details>
            ))}
            <div className="settings-add-definition">
              <label>
                New task ID
                <input
                  value={newRequest}
                  onChange={(event) => setRequest(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="button"
                onClick={() =>
                  attempt(() => {
                    if (
                      !newRequest.trim() ||
                      Object.hasOwn(w.requests || {}, newRequest)
                    )
                      throw new Error("Choose a new, non-empty task ID.");
                    if (draft.apply(requestEdit(draft.source, newRequest, [])))
                      setRequest("");
                  })
                }
              >
                Add task
              </button>
            </div>
            <h3>Confirmation rules</h3>
            {Object.keys(w.confirmations || {}).map((id) => (
              <details key={id}>
                <summary>{friendlyName(id)}</summary>
                <ConfirmationFields draft={draft} id={id} />
              </details>
            ))}
            <div className="settings-new-rule">
              <label>
                New rule ID
                <input
                  value={newRule}
                  onChange={(event) => setRule(event.target.value)}
                />
              </label>
              <label>
                Task for the new rule
                <Select
                  value={ruleRequest}
                  onChange={(event) => {
                    setRuleRequest(event.target.value);
                    setApproval("");
                    setProtectedFields([]);
                  }}
                >
                  <option value="">Choose task…</option>
                  {Object.keys(w.requests || {}).map((id) => (
                    <option key={id} value={id}>
                      {friendlyName(id)}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                Approval field for the new rule
                <Select
                  value={approval}
                  onChange={(event) => setApproval(event.target.value)}
                >
                  <option value="">Choose boolean field…</option>
                  {(w.requests?.[ruleRequest]?.fields || [])
                    .filter((id) => w.fields?.[id]?.type === "boolean")
                    .map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </Select>
              </label>
              <Choices
                legend="Details protected by the new rule"
                values={w.requests?.[ruleRequest]?.fields || []}
                selected={protectedFields}
                onChange={setProtectedFields}
              />
              <button
                type="button"
                className="button"
                onClick={() =>
                  attempt(() => {
                    if (
                      !newRule.trim() ||
                      Object.hasOwn(w.confirmations || {}, newRule)
                    )
                      throw new Error("Choose a new, non-empty rule ID.");
                    if (
                      draft.apply(
                        confirmationEdit(draft.source, newRule, {
                          request: ruleRequest,
                          fields: protectedFields,
                          acceptance_field: approval,
                          require_delivery: true,
                        }),
                      )
                    ) {
                      setActiveRule(newRule);
                      setRule("");
                    }
                  })
                }
              >
                Add rule
              </button>
            </div>
          </details>
        </>
      )}
    </SettingsDialog>
  );
}
