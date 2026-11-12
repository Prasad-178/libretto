import { useState } from "react";
import { Select } from "../ui/Select";
import type { Workflow } from "../workflow";
import type { StudioDocument, DocumentTransaction } from "./types";
import { DefinitionActions } from "./ConfirmationFields";
import { definitionUses } from "./settings-edits";
import { fieldReferences } from "./field-references";
import { humanizeId } from "./workflow-model";
import { TokenList } from "./RecognitionTerms";
export function CollectedDataPage({
  workflow,
  document,
  onTransaction,
  onStep,
}: {
  workflow: Workflow;
  document: StudioDocument;
  onTransaction: (tx: DocumentTransaction) => void;
  onStep: (id: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [newId, setNewId] = useState(""),
    [newType, setNewType] = useState("string"),
    [error, setError] = useState("");
  const id = Object.hasOwn(workflow.fields || {}, selected)
    ? selected
    : Object.keys(workflow.fields || {})[0];
  const field = workflow.fields?.[id],
    refs = id ? fieldReferences(workflow, id) : [],
    uses = id ? definitionUses(workflow, "fields", id) : [];
  const apply = (tx: DocumentTransaction) => {
    try {
      onTransaction(tx);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const change = (key: string, value: unknown) =>
    apply({
      label: `Edit ${id}`,
      historyGroup: `field:${id}:${key}`,
      operations: [{ op: "set", path: ["fields", id, key], value }],
    });
  return (
    <div className="definition-browser">
      <div className="definition-list" aria-label="Information fields">
        {Object.entries(workflow.fields || {}).map(([key, item]) => (
          <button
            key={key}
            aria-label={`Edit ${humanizeId(key)} field`}
            className={key === id ? "selected" : ""}
            onClick={() => setSelected(key)}
          >
            <div>
              <strong>{humanizeId(key)}</strong>
              <span>{item.type === "boolean" ? "Yes / no" : "Text"}</span>
            </div>
            <code>{key}</code>
            <small>
              {[
                ...new Set(
                  fieldReferences(workflow, key).map(
                    (ref) => workflow.nodes[ref.nodeId].title || ref.nodeId,
                  ),
                ),
              ].join(" · ") || "Not used in step rules"}
            </small>
          </button>
        ))}
        {!id && <p>No information fields yet. Add the first field below.</p>}
        <details className="data-add">
          <summary>Add collected data</summary>
          <label>
            New field ID
            <input
              value={newId}
              onChange={(event) => setNewId(event.target.value)}
            />
          </label>
          <label>
            New field type
            <Select
              value={newType}
              onChange={(event) => setNewType(event.target.value)}
            >
              <option value="string">Text</option>
              <option value="boolean">Yes / no</option>
            </Select>
          </label>
          <button
            className="button"
            onClick={() => {
              if (
                !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(newId) ||
                Object.hasOwn(workflow.fields || {}, newId)
              ) {
                setError("Choose a new field ID starting with a letter.");
                return;
              }
              if (
                apply({
                  label: "Add field",
                  operations: [
                    {
                      op: "set",
                      path: ["fields", newId],
                      value: { type: newType },
                    },
                  ],
                })
              ) {
                setSelected(newId);
                setNewId("");
              }
            }}
          >
            Add field
          </button>
        </details>
      </div>
      <section
        className="definition-detail"
        aria-label="Field details"
        key={id}
      >
        {field ? (
          <>
            <small>FIELD DETAILS</small>
            <header>
              <h3>{humanizeId(id)}</h3>
              <code>{id}</code>
            </header>
            <label>
              What should the agent collect?
              <textarea
                aria-label="What should the agent collect?"
                rows={4}
                value={field.description || ""}
                onChange={(event) => change("description", event.target.value)}
              />
              <span>
                Describe the information clearly so the stage controller knows
                what to extract.
              </span>
            </label>
            <label>
              Type
              <Select
                value={field.type || "string"}
                disabled={uses.length > 0}
                onChange={(event) => change("type", event.target.value)}
              >
                <option value="string">Text</option>
                <option value="boolean">Yes / no</option>
              </Select>
            </label>
            {!!uses.length && (
              <p>
                This field is referenced. Update or remove its uses before
                changing the type.
              </p>
            )}
            <section>
              <h4>Used by</h4>
              {refs.map((ref, index) => (
                <button
                  className="field-reference"
                  key={index}
                  onClick={() => onStep(ref.nodeId)}
                >
                  {workflow.nodes[ref.nodeId].title || ref.nodeId} · {ref.kind}{" "}
                  →
                </button>
              ))}
              <p>
                {uses.length
                  ? `Structured uses: ${uses.join(", ")}`
                  : "No structured references."}
              </p>
            </section>
            <details open={field.type === "boolean"}>
              <summary>Advanced · Choices and stable field ID</summary>
              {field.type === "boolean" && (
                <p>
                  Allowed choices do not restrict yes/no values. Retained
                  choices remain editable for a later conversion to Text.
                </p>
              )}
              <h4>Allowed choices</h4>
              <TokenList
                value={field.choices || []}
                onChange={(value) => change("choices", value)}
                disabled={!!document.running}
                termName="allowed choice"
                maxTerms={Infinity}
                maxLength={2000}
              />
              <DefinitionActions
                kind="fields"
                id={id}
                onRenamed={setSelected}
                draft={{
                  source: document.source,
                  metadata: document.metadata,
                  workflow,
                  setError,
                  apply,
                }}
              />
            </details>
          </>
        ) : (
          <p>Select a field to edit its description, type and uses.</p>
        )}
      </section>
      {error && (
        <p role="alert" className="inspector-error">
          {error}
        </p>
      )}
    </div>
  );
}
