import { readWorkflow } from "../workflow";
import { useState, type ReactNode } from "react";
import {
  Download,
  FolderOpen,
  KeyRound,
  Play,
  Pencil,
  Redo2,
  Undo2,
  UserRound,
  GitBranch,
  Library,
  Wrench,
  List,
  Code2,
} from "lucide-react";
import type { StudioDocument } from "./types";
import { DocumentStatus } from "./DocumentStatus";
import { parseIssues } from "./changes";
import { RenameDialog } from "./RenameDialog";
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
  onRename,
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
  onRename: (name: string, filename: string) => void;
  testOpen: boolean;
  children: ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const workflow =
    document.running?.workflow ||
    readWorkflow(document.source) ||
    document.lastValid?.workflow;
  const valid = document.validation.state === "valid";
  return (
    <div
      className={`studio studio-v2 studio-v3 ${testOpen ? "with-test" : ""}`}
    >
      <header className="studio-topbar">
        <a className="studio-brand" href="/" aria-label="Libretto home">
          <span className="brand-bars">
            <i />
            <i />
          </span>
          libretto
        </a>
        <button
          className="studio-file-name"
          title="Rename workflow"
          aria-label="Rename workflow"
          disabled={!!document.running || !document.source}
          onClick={() => setRenaming(true)}
        >
          <span className="workflow-identity">
            <strong>{workflow?.name || "Untitled workflow"}</strong>
            <span>{document.filename}</span>
          </span>
          <Pencil size={13} />
        </button>
        <div className="topbar-actions">
          <div className="studio-history">
            <button
              aria-label="Undo (⌘Z)"
              title="Undo (⌘Z)"
              disabled={!document.past.length || !!document.running}
              onClick={onUndo}
            >
              <Undo2 size={18} />
            </button>
            <button
              aria-label="Redo (⇧⌘Z)"
              title="Redo (⇧⌘Z)"
              disabled={!document.future.length || !!document.running}
              onClick={onRedo}
            >
              <Redo2 size={18} />
            </button>
          </div>
          <DocumentStatus document={document} />
          <button
            className={`nav-validate ${valid ? "valid" : ""}`}
            onClick={onValidate}
            disabled={
              document.validation.state === "pending" || !document.source
            }
          >
            {document.validation.state === "pending"
              ? "Validating…"
              : valid
                ? "Validated ✓"
                : "Validate"}
          </button>
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
      <nav className="studio-sidebar" aria-label="Studio sections">
        <span className="sidebar-heading">Build</span>
        <div
          role="tablist"
          aria-label="Studio sections"
          aria-orientation="vertical"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            const tabs = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              ),
            );
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      tabs.length) %
                    tabs.length;
            tabs[next].click();
            tabs[next].focus();
          }}
        >
          {[
            { id: "agent", label: "Agent", icon: UserRound },
            { id: "workflow", label: "Workflow", icon: GitBranch },
            { id: "knowledge", label: "Knowledge", icon: Library },
            { id: "tools", label: "Tools", icon: Wrench },
            { id: "fields", label: "Collected data", icon: List },
            { id: "test", label: "Test & debug", icon: Play },
            { id: "yaml", label: "YAML", icon: Code2 },
          ].map(({ id, label, icon: Icon }) => {
            const selected = testOpen
              ? id === "test"
              : (tab === "routes" ? "workflow" : tab) === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={selected ? "selected" : ""}
                onClick={() =>
                  id === "test" ? !testOpen && onTest() : onTab(id)
                }
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <button
          className="sidebar-connection"
          aria-label="Test connection settings"
          onClick={onConnection}
        >
          <KeyRound size={19} aria-hidden="true" /> Connection
        </button>
      </nav>
      <div className="studio-small-screen" role="note">
        The workflow editor needs a window at least 1024px wide. You can still
        open and export your YAML here.
      </div>
      <main className="studio-main">{children}</main>
      {renaming && (
        <RenameDialog
          name={workflow?.name || ""}
          filename={document.filename}
          onSave={onRename}
          onClose={() => setRenaming(false)}
        />
      )}
    </div>
  );
}
