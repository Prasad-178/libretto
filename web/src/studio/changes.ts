import { parseDocument, type Document } from "yaml";
import type { WorkflowIssue, YamlPath } from "./types";
export type WorkflowChange = {
  path: YamlPath;
  label: string;
  before: unknown;
  after: unknown;
  from: number;
};
export function parseIssues(source: string): WorkflowIssue[] {
  try {
    return parseDocument(source).errors.map((error) => ({
      path: [],
      message: error.message,
      severity: "error",
      from: error.pos[0],
      to: error.pos[1],
    }));
  } catch (error) {
    return [
      {
        path: [],
        message: error instanceof Error ? error.message : "Invalid YAML",
        severity: "error",
      },
    ];
  }
}
function range(
  document: Document,
  path: YamlPath,
): { from: number; to: number } | null {
  let prefix = [...path];
  while (prefix.length) {
    const node = document.getIn(prefix, true);
    if (
      node &&
      typeof node === "object" &&
      "range" in node &&
      Array.isArray(node.range)
    )
      return { from: node.range[0], to: node.range[1] };
    prefix.pop();
  }
  return null;
}
export function locateIssues(
  source: string,
  issues: WorkflowIssue[],
): WorkflowIssue[] {
  const document = parseDocument(source);
  const seen = new Set<string>();
  return issues
    .map((issue) =>
      issue.from !== undefined
        ? issue
        : { ...issue, ...range(document, issue.path) },
    )
    .filter((issue) => {
      const key = JSON.stringify([
        issue.path,
        issue.message,
        issue.from,
        issue.to,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function describeChanges(
  original: string,
  current: string,
): WorkflowChange[] {
  if (original === current) return [];
  const before = parseDocument(original),
    after = parseDocument(current);
  if (before.errors.length || after.errors.length)
    return [
      {
        path: [],
        label: "Raw YAML draft",
        before: original,
        after: current,
        from: 0,
      },
    ];
  let a: unknown, b: unknown;
  try {
    a = before.toJS({ maxAliasCount: 0 });
    b = after.toJS({ maxAliasCount: 0 });
  } catch {
    return [
      {
        path: [],
        label: "Raw YAML draft",
        before: original,
        after: current,
        from: 0,
      },
    ];
  }
  const changes: WorkflowChange[] = [];
  function compare(a: unknown, b: unknown, path: (string | number)[]) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      Array.isArray(a) === Array.isArray(b) &&
      (!Array.isArray(a) || a.length === (b as unknown[]).length)
    ) {
      for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
        const segment = Array.isArray(b) ? Number(key) : key;
        compare(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          [...path, segment],
        );
      }
    } else
      changes.push({
        path,
        label: path.map(String).join(" › ") || "Workflow",
        before: a,
        after: b,
        from: range(after, path)?.from ?? range(before, path)?.from ?? 0,
      });
  }
  compare(a, b, []);
  return changes.sort((a, b) => a.from - b.from);
}
