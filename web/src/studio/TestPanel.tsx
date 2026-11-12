import type { ReactNode } from "react";
import type { ValidatedRevision } from "./types";
export function TestPanel({
  snapshot,
  children,
  summary,
}: {
  snapshot: ValidatedRevision | null;
  children: ReactNode;
  summary: ReactNode;
}) {
  return (
    <aside className="test-panel" aria-label="Agent test">
      <div className="test-snapshot-note">
        {snapshot
          ? `Testing revision ${snapshot.revision} · editing paused until Stop`
          : "Test the current draft · validation runs before connection"}
      </div>
      <div className="debug-main">{children}</div>
      {summary}
    </aside>
  );
}
