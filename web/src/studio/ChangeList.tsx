import type { WorkflowChange } from "./changes";
const display = (value: unknown) =>
  typeof value === "string"
    ? value
    : value === undefined
      ? "(not present)"
      : JSON.stringify(value, null, 2);
export function ChangeList({
  changes,
  onJump,
}: {
  changes: WorkflowChange[];
  onJump?: (from: number) => void;
}) {
  return (
    <div className="change-list">
      {changes.length ? (
        changes.map((change, index) => (
          <details
            className="workflow-change"
            key={JSON.stringify(change.path) + index}
          >
            <summary>{change.label}</summary>
            <div className="change-diff">
              <pre className="diff-before">− {display(change.before)}</pre>
              <pre className="diff-after">+ {display(change.after)}</pre>
            </div>
            {onJump && (
              <button onClick={() => onJump(change.from)}>
                Go to change →
              </button>
            )}
          </details>
        ))
      ) : (
        <p className="workspace-help">No executable changes.</p>
      )}
    </div>
  );
}
