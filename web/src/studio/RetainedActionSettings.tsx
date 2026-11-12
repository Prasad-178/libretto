import { useState } from "react";
import { Select } from "../ui/Select";
import { Choices, type SettingsDraft } from "./SettingsDialog";
/** Inactive action values remain source-backed and editable before a conversion. */
export function RetainedActionSettings({
  draft,
  nodeId,
}: {
  draft: SettingsDraft;
  nodeId: string;
}) {
  const node = draft.workflow.nodes[nodeId],
    fields = Object.keys(draft.workflow.fields || {});
  const [parameter, setParameter] = useState(""),
    [field, setField] = useState("");
  const set = (key: string, value: unknown) =>
    draft.set(["nodes", nodeId, key], value);
  return (
    <details>
      <summary>Retained action settings</summary>
      <p>
        These values are inactive for this step kind. They are used if it
        becomes an Action. Python still owns the tool contract.
      </p>
      <label>
        Retained action tool
        <Select
          value={node.tool || ""}
          onChange={(event) =>
            event.target.value
              ? set("tool", event.target.value)
              : draft.apply({
                  label: "Clear retained tool",
                  operations: [
                    { op: "delete", path: ["nodes", nodeId, "tool"] },
                  ],
                })
          }
        >
          <option value="">None</option>
          {[
            ...new Set([
              ...(draft.workflow.tools || []),
              ...(node.tool ? [node.tool] : []),
            ]),
          ].map((tool) => (
            <option key={tool}>{tool}</option>
          ))}
        </Select>
      </label>
      <Choices
        legend="Retained required fields"
        values={fields}
        selected={node.requires || []}
        onChange={(value) => set("requires", value)}
      />
      <h4>Retained input mappings</h4>
      {Object.entries(node.arguments || {}).map(([id, value]) => (
        <div className="retained-mapping" key={id}>
          <label>
            {id}
            <Select
              aria-label={`Retained input ${id}`}
              value={value}
              onChange={(event) =>
                draft.set(
                  ["nodes", nodeId, "arguments", id],
                  event.target.value,
                )
              }
            >
              {fields.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </Select>
          </label>
          <button
            type="button"
            onClick={() =>
              draft.apply({
                label: "Remove retained mapping",
                operations: [
                  { op: "delete", path: ["nodes", nodeId, "arguments", id] },
                ],
              })
            }
            aria-label={`Remove retained input ${id}`}
          >
            Remove
          </button>
        </div>
      ))}
      <label>
        Retained parameter ID
        <input
          value={parameter}
          onChange={(event) => setParameter(event.target.value)}
        />
      </label>
      <label>
        Retained parameter field
        <Select
          value={field}
          onChange={(event) => setField(event.target.value)}
        >
          <option value="">Choose a field…</option>
          {fields.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </Select>
      </label>
      <button
        type="button"
        className="button"
        disabled={!parameter.trim() || !field}
        onClick={() => {
          if (Object.hasOwn(node.arguments || {}, parameter)) {
            draft.setError("This parameter already has a mapping.");
            return;
          }
          draft.set(["nodes", nodeId, "arguments", parameter], field);
          setParameter("");
        }}
      >
        Add retained input
      </button>
    </details>
  );
}
