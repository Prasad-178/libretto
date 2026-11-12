import { StepSettingsDialog } from "./studio/StepSettingsDialog";
import { useEffect, useRef, useState } from "react";
import { Code2, Undo2, X } from "lucide-react";
import type { Workflow } from "./workflow";
import type { EdgeSelection } from "./studio-editing";
import { branchLabel } from "./graph";
import { applyTransaction } from "./studio/yaml-edits";
import { ActionInspector } from "./studio/ActionInspector";
import { RouteInspector } from "./studio/RouteInspector";
import { StepComposer } from "./studio/StepComposer";
import { StepConnections, ConnectionRows } from "./studio/StepConnections";
import { StepPromptEditor } from "./studio/StepPromptEditor";
import { predicateFields } from "./studio/PredicateEditor";
import { readbackTokens } from "./studio/settings-edits";
import { humanizeId } from "./studio/workflow-model";
import type { StudioMetadata, DocumentTransaction } from "./studio/types";
import type { ToolManifest } from "./studio/tool-manifest";
export type Selection =
  | {
      kind: "step";
      id: string;
      section?: "prompt" | "connections" | "knowledge";
    }
  | ({ kind: "edge" | "insert" } & EdgeSelection);
export default function StepInspector({
  source,
  workflow,
  selection,
  onSelect,
  onChange,
  onClose,
  onYaml,
  onUndo,
  canUndo,
  readOnly,
  tools = [],
  onTransaction,
  onHistoryEnd,
  onSources,
  onFields,
  metadata,
}: {
  metadata: StudioMetadata;
  source: string;
  workflow: Workflow;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (s: string, group?: string) => void;
  onClose: () => void;
  onYaml: () => void;
  onUndo: () => void;
  canUndo: boolean;
  readOnly: boolean;
  tools?: ToolManifest[];
  onTransaction?: (tx: DocumentTransaction) => void;
  onHistoryEnd?: () => void;
  onSources?: (id: string) => void;
  onFields?: () => void;
}) {
  const [stepSettings, setStepSettings] = useState(false),
    [error, setError] = useState(""),
    [section, setSection] = useState(
      selection.kind === "step" ? selection.section || "prompt" : "prompt",
    );
  const panel = useRef<HTMLElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const id = selection.kind === "step" ? selection.id : selection.source,
    node = workflow.nodes[id];
  const edge =
    selection.kind !== "step"
      ? node?.edges?.find((e) => e.id === selection.edgeId)
      : undefined;
  useEffect(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panel.current
      ?.querySelector<HTMLElement>("input,textarea,select,button")
      ?.focus();
    return () => {
      onHistoryEnd?.();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, []);
  const requestedSection =
    selection.kind === "step" ? selection.section : undefined;
  useEffect(() => {
    if (requestedSection) setSection(requestedSection);
  }, [requestedSection]);
  if (!node || (selection.kind !== "step" && !edge)) return null;
  function commit(tx: DocumentTransaction): boolean {
    if (readOnly) return false;
    try {
      if (onTransaction) onTransaction(tx);
      else onChange(applyTransaction(source, tx).source, tx.historyGroup);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  const change = (key: string, value: unknown, group?: string) =>
    commit({
      label: `Edit ${node.title || id}`,
      historyGroup: group,
      operations: [{ op: "set", path: ["nodes", id, key], value }],
    });
  let tokens: string[] = [];
  try {
    tokens = readbackTokens(node.readback || "").map((token) => token.field);
  } catch {
    /* Invalid readbacks remain editable. */
  }
  const fields = [
    ...new Set([
      ...(node.edges || []).flatMap((e) => predicateFields(e.predicate)),
      ...(node.requires || []),
      ...Object.values(node.arguments || {}),
      ...tokens,
    ]),
  ];
  const promptKey =
    node.kind === "say"
      ? "text"
      : node.readback && node.confirmation
        ? "readback"
        : "prompt";
  const prompt = node[promptKey] || "";
  const sources = [
    ...new Set([
      ...(workflow.common_knowledge || []),
      ...(node.knowledge || []),
    ]),
  ];
  return (
    <aside
      ref={panel}
      className="studio-inspector"
      aria-label={
        selection.kind === "step"
          ? "Edit step"
          : selection.kind === "edge"
            ? "Edit route"
            : "Insert step"
      }
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !e.defaultPrevented &&
          !(e.target as HTMLElement).closest("dialog,[role=listbox]")
        ) {
          e.stopPropagation();
          onClose();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          onHistoryEnd?.();
      }}
    >
      <header className="studio-inspector-header">
        <div className="inspector-eyebrow">
          {selection.kind === "step"
            ? `${humanizeId(node.kind)} step`
            : selection.kind === "edge"
              ? "Connection"
              : "Insert step"}
          <button aria-label="Close inspector" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {selection.kind === "step" ? (
          <>
            <input
              className="step-title-input"
              aria-label="Step name"
              value={node.title || ""}
              placeholder={id}
              disabled={readOnly}
              onChange={(e) =>
                change("title", e.target.value, `step:${id}:title`)
              }
              onBlur={onHistoryEnd}
            />
            <button
              className="inspector-link"
              disabled={readOnly}
              onClick={() => setStepSettings(true)}
            >
              Step settings
            </button>
          </>
        ) : (
          <>
            <h2>
              {selection.kind === "edge"
                ? branchLabel(edge!)
                : "Add to workflow"}
            </h2>
            <button
              className="inspector-back"
              onClick={() =>
                onSelect({ kind: "step", id, section: "connections" })
              }
            >
              ← {node.title || id}
            </button>
          </>
        )}
      </header>
      {selection.kind === "step" && (
        <nav className="inspector-main-tabs" aria-label="Step sections">
          {[
            {
              id: "prompt" as const,
              label:
                node.kind === "action"
                  ? "Action"
                  : node.kind === "end"
                    ? "Overview"
                    : "Prompt",
            },
            { id: "connections" as const, label: "Connections" },
            { id: "knowledge" as const, label: "Knowledge" },
          ].map((tab) => (
            <button
              key={tab.id}
              aria-current={section === tab.id ? "page" : undefined}
              className={section === tab.id ? "selected" : ""}
              onClick={() => {
                onHistoryEnd?.();
                setSection(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}
      <div className="studio-inspector-scroll">
        {readOnly && (
          <p className="inspector-notice">
            Showing the running snapshot. Stop the test to edit.
          </p>
        )}
        {error && (
          <p className="inspector-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={readOnly}>
          {selection.kind === "insert" ? (
            <StepComposer
              source={source}
              workflow={workflow}
              route={selection}
              tools={tools}
              onCancel={onClose}
              onCommit={(next, nodeId) => {
                onChange(next);
                onSelect({ kind: "step", id: nodeId });
              }}
            />
          ) : selection.kind === "edge" ? (
            <RouteInspector
              source={source}
              workflow={workflow}
              route={selection}
              tools={tools}
              metadata={metadata}
              onRemoved={() =>
                onSelect({ kind: "step", id, section: "connections" })
              }
              onRenamed={(edgeId) =>
                onSelect({ kind: "edge", source: id, edgeId })
              }
              onTransaction={commit}
            />
          ) : (
            <>
              {section === "prompt" && (
                <>
                  {node.begin_request && (
                    <p className="inspector-notice">
                      Begins request: <code>{node.begin_request}</code>
                    </p>
                  )}
                  {node.confirmation && (
                    <p className="inspector-notice">
                      Caller confirmation required ·{" "}
                      <code>{node.confirmation}</code>. Review this rule in Step
                      settings.
                    </p>
                  )}
                  {(node.kind === "conversation" || node.kind === "say") && (
                    <StepPromptEditor
                      title={node.title || id}
                      value={prompt}
                      readback={promptKey === "readback"}
                      literal={node.kind === "say"}
                      disabled={readOnly}
                      onChange={(value) =>
                        change(promptKey, value, `step:${id}:${promptKey}`)
                      }
                      onHistoryEnd={onHistoryEnd}
                    />
                  )}
                  {node.kind === "action" && (
                    <ActionInspector
                      source={source}
                      workflow={workflow}
                      nodeId={id}
                      tools={tools}
                      onTransaction={commit}
                      onSettings={() => setStepSettings(true)}
                    />
                  )}
                  {node.kind === "end" && (
                    <section>
                      <p>This step ends the conversation.</p>
                    </section>
                  )}
                  {!!fields.length && (
                    <section>
                      <h3>Information used here</h3>
                      <div className="inspector-field-tags">
                        {fields.map((field) => (
                          <span key={field} title={field}>
                            {humanizeId(field)}
                          </span>
                        ))}
                      </div>
                      {onFields && (
                        <button className="inspector-link" onClick={onFields}>
                          Manage collected data →
                        </button>
                      )}
                    </section>
                  )}
                  {node.kind !== "action" && (node.edges || []).length > 0 && (
                    <section>
                      <h3>Next step</h3>
                      <ConnectionRows
                        edges={(node.edges || []).slice(0, 2)}
                        workflow={workflow}
                        nodeId={id}
                        onSelect={onSelect}
                      />
                      {(node.edges || []).length > 2 && (
                        <button
                          className="inspector-link"
                          onClick={() => setSection("connections")}
                        >
                          View all {node.edges?.length} connections →
                        </button>
                      )}
                    </section>
                  )}
                  <details className="inspector-advanced">
                    <summary>Advanced · Step ID and YAML</summary>
                    <p className="inspector-help">
                      Step ID: <code>{id}</code>
                    </p>
                    <button className="inspector-link" onClick={onYaml}>
                      Open YAML definition ↗
                    </button>
                  </details>
                </>
              )}
              {section === "connections" && (
                <StepConnections
                  source={source}
                  workflow={workflow}
                  nodeId={id}
                  tools={tools}
                  onSelect={onSelect}
                  onChange={onChange}
                />
              )}
              {section === "knowledge" && (
                <section>
                  <h3>Knowledge available here · {sources.length}</h3>
                  <p className="inspector-help">
                    {sources.length
                      ? sources.join(", ")
                      : "No collections attached."}
                  </p>
                  <p className="inspector-help">
                    Includes shared collections and this step’s own attachments.
                  </p>
                  <button
                    className="inspector-link"
                    onClick={() => onSources?.(id)}
                  >
                    Manage source usage →
                  </button>
                </section>
              )}
            </>
          )}
        </fieldset>
      </div>
      <footer className="studio-inspector-footer">
        <span>Draft · edits stay local</span>
        <button
          className="inspector-link"
          disabled={!canUndo || readOnly}
          onClick={onUndo}
        >
          <Undo2 size={13} />
          Undo
        </button>
        <button className="inspector-yaml" onClick={onYaml}>
          <Code2 size={13} />
          YAML
        </button>
      </footer>
      {stepSettings && (
        <StepSettingsDialog
          tools={tools}
          source={source}
          metadata={metadata}
          nodeId={id}
          onClose={() => setStepSettings(false)}
          onSave={(tx, nextId) => {
            if (readOnly)
              throw new Error("Stop the test before editing settings.");
            if (onTransaction) onTransaction(tx);
            else onChange(applyTransaction(source, tx).source);
            onHistoryEnd?.();
            if (nextId) onSelect({ kind: "step", id: nextId });
            else onClose();
          }}
        />
      )}
    </aside>
  );
}
