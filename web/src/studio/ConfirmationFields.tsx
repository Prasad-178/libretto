import { useEffect, useState } from "react";
import { Select } from "../ui/Select";
import { Choices, friendlyName, type SettingsDraft } from "./SettingsDialog";
import {
  removalUses,
  removeDefinition,
  renameDefinition,
  type DefinitionKind,
} from "./settings-edits";

export function DefinitionActions({
  draft,
  kind,
  id,
  onRenamed,
}: {
  draft: Pick<
    SettingsDraft,
    "source" | "workflow" | "metadata" | "apply" | "setError"
  > &
    Partial<Pick<SettingsDraft, "markPending">>;
  kind: DefinitionKind;
  id: string;
  onRenamed?: (id: string) => void;
}) {
  const [nextId, setId] = useState(id);
  const pendingKey = `${kind}:${id}`;
  useEffect(() => () => draft.markPending?.(pendingKey, false), [kind, id]);
  const uses = removalUses(draft.workflow, kind, id);
  return (
    <div className="definition-actions">
      <label>
        New ID
        <input
          value={nextId}
          onChange={(event) => {
            setId(event.target.value);
            draft.markPending?.(pendingKey, event.target.value !== id);
          }}
        />
      </label>
      <button
        type="button"
        className="button"
        onClick={() => {
          try {
            if (
              draft.apply(
                renameDefinition(
                  draft.source,
                  kind,
                  id,
                  nextId,
                  draft.metadata,
                ),
              )
            ) {
              draft.markPending?.(pendingKey, false);
              onRenamed?.(nextId);
            }
          } catch (error) {
            draft.setError((error as Error).message);
          }
        }}
      >
        Rename ID
      </button>
      {nextId !== id && (
        <button
          type="button"
          className="button"
          onClick={() => {
            setId(id);
            draft.markPending?.(pendingKey, false);
          }}
        >
          Cancel rename
        </button>
      )}
      <button
        type="button"
        className="button"
        disabled={uses.length > 0}
        title={uses.length ? `Used by ${uses.join(", ")}` : undefined}
        onClick={() => {
          try {
            draft.apply(
              removeDefinition(draft.source, kind, id, draft.metadata),
            );
          } catch (error) {
            draft.setError((error as Error).message);
          }
        }}
      >
        Remove{" "}
        {kind === "requests"
          ? "task"
          : kind === "confirmations"
            ? "rule"
            : kind === "fields"
              ? "field"
              : "step"}
      </button>
      {uses.length > 0 && (
        <p>
          Used by {uses.join(", ")}. Remove these references before deleting.
        </p>
      )}
    </div>
  );
}

export function ConfirmationFields({
  draft,
  id,
}: {
  draft: SettingsDraft;
  id: string;
}) {
  const w = draft.workflow,
    rule = Object.hasOwn(w.confirmations || {}, id)
      ? w.confirmations![id]
      : undefined;
  if (!rule) return null;
  const uses = Object.entries(w.nodes).filter(
    ([, node]) => node.confirmation === id,
  );
  const scope = w.requests?.[rule.request]?.fields || [];
  const booleans = scope.filter(
    (field) => w.fields?.[field]?.type === "boolean",
  );
  const change = (key: string, value: unknown) =>
    draft.set(["confirmations", id, key], value);
  return (
    <section
      className="confirmation-fields"
      aria-label={`Confirmation rule ${id}`}
    >
      <h3>Confirm before an action runs</h3>
      <p>
        The agent reads the current details back. The caller approves them. Only
        then can the guarded action run.
      </p>
      <p className="settings-shared-rule">
        Shared with{" "}
        {uses.map(([nodeId, node]) => node.title || nodeId).join(", ") ||
          "no steps yet"}
        . Changes apply to every step using this rule.
      </p>
      <Choices
        legend="Which details must the caller confirm?"
        values={scope.filter((field) => field !== rule.acceptance_field)}
        selected={rule.fields}
        onChange={(value) => change("fields", value)}
      />
      <div className="settings-readback-locations">
        <h4>Where the agent reads these back</h4>
        {uses
          .filter(([, node]) => node.readback)
          .map(([nodeId, node]) => (
            <p key={nodeId}>
              {node.title || nodeId} <code>{nodeId}</code>
            </p>
          ))}
        <p>
          Edit that step’s readback message to add or change the details it
          reads. Every shared readback must include all selected details.
        </p>
      </div>
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={rule.require_delivery !== false}
          onChange={(event) => change("require_delivery", event.target.checked)}
        />
        Wait until the full message has played
      </label>
      <p>
        {rule.require_delivery === false
          ? "Delivery is explicitly waived for this rule. A later caller turn must still approve the current details."
          : "The caller can approve after hearing every detail. Corrections require fresh confirmation."}
      </p>
      <details>
        <summary>Advanced · Task memory and confirmation fields</summary>
        <label>
          Task memory
          <Select
            value={rule.request}
            onChange={(event) => change("request", event.target.value)}
          >
            {Object.keys(w.requests || {}).map((key) => (
              <option key={key} value={key}>
                {friendlyName(key)}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Approval boolean field
          <Select
            value={rule.acceptance_field}
            onChange={(event) => change("acceptance_field", event.target.value)}
          >
            {booleans.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Optional consent boolean field
          <Select
            value={rule.consent_field || ""}
            onChange={(event) =>
              change("consent_field", event.target.value || null)
            }
          >
            <option value="">None</option>
            {booleans
              .filter((key) => key !== rule.acceptance_field)
              .map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
          </Select>
        </label>
        <DefinitionActions
          key={id}
          draft={draft}
          kind="confirmations"
          id={id}
        />
      </details>
    </section>
  );
}
