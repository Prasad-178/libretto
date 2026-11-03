import { Select } from "../ui/Select";
import { lazy, Suspense, useMemo, useState } from "react";
import { parseDocument } from "yaml";
import type { StudioDocument } from "./types";
import type { CodeJump } from "../YamlCode";
import { describeChanges, locateIssues, parseIssues } from "./changes";
import { ChangeList } from "./ChangeList";
const YamlCode = lazy(() => import("../YamlCode"));
export function YamlWorkspace({
  document,
  onChange,
  onHistoryEnd,
  onValidate,
}: {
  document: StudioDocument;
  onChange: (source: string) => void;
  onHistoryEnd: () => void;
  onValidate: () => void;
}) {
  const [tab, setTab] = useState("problems"),
    [jump, setJump] = useState<CodeJump | null>(null);
  const problems = useMemo(
    () =>
      locateIssues(document.source, [
        ...parseIssues(document.source),
        ...document.validation.issues,
      ]),
    [document.source, document.validation.issues],
  );
  const changes = useMemo(
    () => describeChanges(document.importedSource, document.source),
    [document.importedSource, document.source],
  );
  const yaml = useMemo(() => parseDocument(document.source), [document.source]);
  const nodes = yaml.get("nodes");
  function go(from: number, to?: number) {
    setJump({ from, to, nonce: Date.now() });
  }
  return (
    <section className="yaml-workspace-v2" aria-label="YAML workspace">
      <header className="yaml-workspace-toolbar">
        <strong>{document.filename}</strong>
        <Select
          aria-label="Jump to YAML step"
          value=""
          onChange={(e) => {
            const node = yaml.getIn(["nodes", e.target.value], true);
            if (
              node &&
              typeof node === "object" &&
              "range" in node &&
              Array.isArray(node.range)
            )
              go(node.range[0], node.range[1]);
          }}
        >
          <option value="">Jump to step…</option>
          {nodes && typeof nodes === "object" && "items" in nodes
            ? (nodes.items as { key: { value: string } }[])
                .filter((pair) => typeof pair.key?.value === "string")
                .map((pair) => (
                  <option key={pair.key.value}>{pair.key.value}</option>
                ))
            : null}
        </Select>
        <span className="yaml-validation-state">
          {document.validation.state === "valid"
            ? "Valid definition"
            : document.validation.state === "pending"
              ? "Validating…"
              : document.validation.state === "unavailable"
                ? "Validation unavailable"
                : "Draft · validation needed"}
        </span>
        <button
          className="button"
          onClick={onValidate}
          disabled={
            !!document.running || document.validation.state === "pending"
          }
        >
          Validate
        </button>
      </header>
      <div className="yaml-workspace-columns">
        <div className="yaml-editor-frame">
          <Suspense fallback={<p>Loading YAML editor…</p>}>
            <YamlCode
              value={document.source}
              onChange={onChange}
              issues={problems}
              jump={jump}
              readOnly={!!document.running}
              onBlur={onHistoryEnd}
            />
          </Suspense>
        </div>
        <aside className="yaml-review-panel">
          <div className="yaml-review-tabs">
            <button
              className={tab === "problems" ? "selected" : ""}
              onClick={() => setTab("problems")}
            >
              Problems {problems.length}
            </button>
            <button
              className={tab === "changes" ? "selected" : ""}
              onClick={() => setTab("changes")}
            >
              Changes {changes.length}
            </button>
          </div>
          <div className="yaml-review-scroll">
            {tab === "changes" ? (
              <ChangeList changes={changes} onJump={(from) => go(from)} />
            ) : (
              <>
                {problems.map((issue, index) => (
                  <div className={`yaml-problem ${issue.severity}`} key={index}>
                    <strong>{issue.message}</strong>
                    {issue.path.length > 0 && (
                      <code>{issue.path.join(" › ")}</code>
                    )}
                    {issue.from !== undefined && (
                      <button onClick={() => go(issue.from!, issue.to)}>
                        Go to line{" "}
                        {
                          document.source.slice(0, issue.from).split("\n")
                            .length
                        }{" "}
                        →
                      </button>
                    )}
                  </div>
                ))}
                {!problems.length && (
                  <p className="workspace-help">
                    {document.validation.state === "valid"
                      ? "No problems. The current definition passed runtime validation."
                      : document.validation.state === "unavailable"
                        ? "The runtime is unavailable. Your draft is retained; try validation again when connected."
                        : "No syntax problems. Validate to check references and runtime support."}
                  </p>
                )}
                <p className="workspace-help">
                  The graph keeps the last valid definition while you fix an
                  invalid draft. Testing requires current runtime validation.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="yaml-workspace-footer">
        <span>YAML · UTF-8 · {document.source.split("\n").length} lines</span>
        <span>Original bytes and untouched prompt values are preserved.</span>
      </footer>
    </section>
  );
}
