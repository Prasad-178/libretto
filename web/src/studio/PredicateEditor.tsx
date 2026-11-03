import type { Workflow } from "../workflow";
const pretty = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export type Predicate = {
  op: string;
  field?: string;
  value?: string | boolean | null;
  conditions?: Predicate[];
};
export function PredicateEditor({
  value,
  fields,
  onChange,
}: {
  value: Predicate;
  fields: NonNullable<Workflow["fields"]>;
  onChange: (v: Predicate) => void;
}) {
  const first = Object.keys(fields)[0] || "";
  return (
    <div className="predicate-editor">
      <select
        aria-label="Check type"
        value={value.op}
        onChange={(e) =>
          onChange(
            ["all", "any", "not"].includes(e.target.value)
              ? {
                  op: e.target.value,
                  conditions: [{ op: "exists", field: first }],
                }
              : {
                  op: e.target.value,
                  field: first,
                  ...(e.target.value === "equals"
                    ? { value: fields[first]?.type === "boolean" ? true : "" }
                    : {}),
                },
          )
        }
      >
        <option value="exists">Information is collected</option>
        <option value="equals">Information equals a value</option>
        <option value="all">All checks pass</option>
        <option value="any">Any check passes</option>
        <option value="not">Check does not pass</option>
      </select>
      {["exists", "equals"].includes(value.op) ? (
        <>
          <select
            aria-label="Information field"
            value={value.field}
            onChange={(e) =>
              onChange({
                ...value,
                field: e.target.value,
                ...(value.op === "equals"
                  ? {
                      value:
                        fields[e.target.value]?.type === "boolean" ? true : "",
                    }
                  : {}),
              })
            }
          >
            {Object.keys(fields).map((id) => (
              <option key={id} value={id}>
                {pretty(id)}
              </option>
            ))}
          </select>
          {value.op === "equals" &&
            (fields[value.field || ""]?.type === "boolean" ? (
              <select
                aria-label="Expected value"
                value={String(value.value)}
                onChange={(e) =>
                  onChange({ ...value, value: e.target.value === "true" })
                }
              >
                <option value="true">Yes / confirmed</option>
                <option value="false">No / not confirmed</option>
              </select>
            ) : (
              <input
                aria-label="Expected value"
                value={String(value.value ?? "")}
                onChange={(e) => onChange({ ...value, value: e.target.value })}
              />
            ))}
        </>
      ) : (
        <div className="predicate-children">
          {value.conditions?.map((c, i) => (
            <div key={i}>
              <PredicateEditor
                value={c}
                fields={fields}
                onChange={(v) =>
                  onChange({
                    ...value,
                    conditions: value.conditions!.map((old, j) =>
                      i === j ? v : old,
                    ),
                  })
                }
              />
              {value.op !== "not" && value.conditions!.length > 1 && (
                <button
                  className="inspector-link"
                  onClick={() =>
                    onChange({
                      ...value,
                      conditions: value.conditions!.filter((_, j) => j !== i),
                    })
                  }
                >
                  Remove check
                </button>
              )}
            </div>
          ))}
          {value.op !== "not" && (
            <button
              className="inspector-link"
              disabled={!first}
              onClick={() =>
                onChange({
                  ...value,
                  conditions: [
                    ...(value.conditions || []),
                    { op: "exists", field: first },
                  ],
                })
              }
            >
              + Add check
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function predicateFields(p: unknown): string[] {
  if (!p || typeof p !== "object") return [];
  const v = p as Predicate;
  return [
    ...(v.field ? [v.field] : []),
    ...(v.conditions || []).flatMap(predicateFields),
  ];
}
