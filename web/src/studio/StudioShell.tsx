import { readWorkflow } from "../workflow";
import type { ReactNode } from "react";
import {
  Download,
  FolderOpen,
  KeyRound,
  Play,
  Redo2,
  Undo2,
} from "lucide-react";
import type { StudioDocument } from "./types";
import { DocumentStatus } from "./DocumentStatus";
import { parseIssues } from "./changes";
export function StudioShell({
  document,
  tab,
  onTab,
  onOpen,
  onExport,
  onTest,
  onValidate,
  onUndo,
  onRedo,
  onConnection,
  testOpen,
  children,
}: {
  document: StudioDocument;
  tab: string;
  onTab: (tab: string) => void;
  onOpen: () => void;
  onExport: () => void;
  onTest: () => void;
  onValidate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onConnection: () => void;
  testOpen: boolean;
  children: ReactNode;
}) {
  const workflow =
    document.running?.workflow ||
    readWorkflow(document.source) ||
    document.lastValid?.workflow;
  const count = workflow
    ? Object.values(workflow.nodes).reduce(
        (n, node) => n + (node.edges?.length || 0),
        0,
      )
    : null;
  const valid = document.validation.state === "valid";
  return (
    <div className={`studio studio-v2 ${testOpen ? "with-test" : ""}`}>
      <header className="studio-topbar">
        <a className="studio-brand" href="/" aria-label="Libretto home">
          <span className="brand-bars">
            <i />
            <i />
          </span>
          libretto
        </a>
        <span className="studio-file-name" title={document.filename}>
          {document.filename}
        </span>
        <div className="topbar-actions">
          <DocumentStatus document={document} />
          <button
            className="button open-project"
            disabled={!!document.running}
            onClick={onOpen}
          >
            <FolderOpen size={15} />
            Open YAML
          </button>
          <button
            className="button"
            onClick={onExport}
            disabled={!document.source}
          >
            <Download size={14} />
            Export YAML
          </button>
          <button
            className="button black"
            onClick={onTest}
            disabled={
              !testOpen &&
              (document.validation.state === "invalid" ||
                parseIssues(document.source).length > 0)
            }
          >
            <Play size={13} />
            {testOpen ? "Back to editor" : "Test agent"}
          </button>
        </div>
      </header>
      <nav className="studio-navigation" aria-label="Studio sections">
        <div role="tablist" aria-label="Studio sections">
          {[
            { id: "workflow", label: "Flow" },
            { id: "routes", label: "Routes" },
            { id: "yaml", label: "YAML" },
            { id: "agent", label: "Settings" },
            { id: "knowledge", label: "Sources" },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "selected" : ""}
              onClick={() => onTab(t.id)}
            >
              {t.label}
              {t.id === "routes" && count !== null && <span>{count}</span>}
            </button>
          ))}
        </div>
        <div className="studio-history">
          <button
            aria-label="Undo (⌘Z)"
            title="Undo (⌘Z)"
            disabled={!document.past.length || !!document.running}
            onClick={onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            aria-label="Redo (⇧⌘Z)"
            title="Redo (⇧⌘Z)"
            disabled={!document.future.length || !!document.running}
            onClick={onRedo}
          >
            <Redo2 size={16} />
          </button>
        </div>
        <button
          className="nav-validate"
          onClick={onValidate}
          disabled={document.validation.state === "pending" || !document.source}
        >
          {document.validation.state === "pending"
            ? "Validating…"
            : valid
              ? "Validated ✓"
              : "Validate"}
        </button>
        <button
          aria-label="Test connection settings"
          className="nav-connection"
          onClick={onConnection}
        >
          <KeyRound size={15} />
        </button>
      </nav>
      <div className="studio-small-screen" role="note">
        The workflow editor needs a window at least 1024px wide. You can still
        open and export your YAML here.
      </div>
      <main className="studio-main">{children}</main>
    </div>
  );
}
