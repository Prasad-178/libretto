import { lazy, Suspense } from "react";
import {
  Check,
  Code2,
  FileText,
  GitBranch,
  Globe2,
  Mic,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { readWorkflow, setYamlValue, type Workflow } from "./workflow";

type Props = {
  source: string;
  onChange: (source: string) => void;
  tab: string;
  validated: boolean;
  validating: boolean;
  issues: string[];
  onValidate: () => void;
  documents: { document: string; heading: string; text: string }[];
  selected: string;
  onSelect: (id: string) => void;
};
const YamlCode = lazy(() => import("./YamlCode"));
export function AgentEditor({
  source,
  onChange,
  tab,
  validated,
  validating,
  issues,
  onValidate,
  documents,
  selected,
  onSelect,
}: Props) {
  const workflow = readWorkflow(source);
  const nodeId = workflow?.nodes[selected] ? selected : workflow?.start || "";
  const node = workflow?.nodes[nodeId];
  function change(path: string[], value: string) {
    onChange(setYamlValue(source, path, value));
  }
  if (tab === "yaml")
    return (
      <div className="yaml-workspace">
        <div className="file-bar">
          <span>
            <Code2 size={15} /> agent.yaml
          </span>
          <span className={validated ? "valid-status" : "muted"}>
            {validated ? (
              <>
                <Check size={12} /> Valid definition
              </>
            ) : (
              "Unvalidated changes"
            )}
          </span>
        </div>
        <Suspense
          fallback={<div className="loading-state">Loading editor…</div>}
        >
          <YamlCode value={source} onChange={onChange} />
        </Suspense>
        <div className="editor-status">
          <span>
            YAML <span>UTF-8</span> {source.split("\n").length} lines
          </span>
          <button onClick={onValidate} disabled={validating}>
            {validating ? "Validating…" : "Validate definition"}
          </button>
        </div>
        {issues.length > 0 && (
          <div className="validation-issues" role="alert">
            {issues.map((issue, i) => (
              <p key={i}>{issue}</p>
            ))}
          </div>
        )}
      </div>
    );
  if (tab === "knowledge")
    return (
      <div className="configuration-scroll">
        <div className="section-intro">
          <h2>Knowledge base</h2>
          <p>
            Documents available to your agent. Retrieval is scoped by the YAML
            configuration.
          </p>
        </div>
        <div className="knowledge-notice">
          <ShieldCheck size={16} />
          <span>
            Bundled demo documents · local retrieval · no vector database
          </span>
        </div>
        {Array.from(new Set(documents.map((d) => d.document))).map((name) => (
          <details className="config-card document-card" key={name}>
            <summary>
              <FileText size={19} />
              <div>
                <strong>{name}</strong>
                <span>
                  {documents.filter((d) => d.document === name).length} passages
                  · Markdown
                </span>
              </div>
              <span className="badge">Available</span>
            </summary>
            <div className="document-content">
              {documents
                .filter((d) => d.document === name)
                .map((d, i) => (
                  <section key={i}>
                    <h3>{d.heading}</h3>
                    <p>{d.text}</p>
                  </section>
                ))}
            </div>
          </details>
        ))}
        <p className="field-help">
          Reference <code>knowledge</code> in your YAML to use these documents.
          Uploading new documents is outside this prototype.
        </p>
      </div>
    );
  if (!workflow)
    return (
      <div className="configuration-scroll">
        <div className="validation-issues">
          <h3>Fix your YAML to continue</h3>
          <p>
            The configuration form needs a readable workflow. Open the YAML tab
            to correct it.
          </p>
        </div>
      </div>
    );
  return (
    <div className="configuration-scroll">
      <div className="section-intro">
        <h2>Agent configuration</h2>
        <p>Define how your agent speaks and what it should do.</p>
      </div>
      <div className="config-grid">
        <div className="config-card compact-card">
          <div className="card-heading">
            <Globe2 size={16} />
            <h3>Language</h3>
          </div>
          <div className="select-look">
            English <span>EN</span>
          </div>
          <p className="field-help">Optimized for English conversations.</p>
        </div>
        <div className="config-card compact-card">
          <div className="card-heading">
            <Mic size={16} />
            <h3>Voice</h3>
          </div>
          <div className="voice-option">
            <span className="mini-orb" />
            <span>
              Haley <small>Deepgram Flux</small>
            </span>
            <span className="badge">Streaming</span>
          </div>
          <p className="field-help">Speech detection and synthesis via Flux.</p>
        </div>
      </div>
      <section className="config-card">
        <div className="card-heading">
          <WandSparkles size={16} />
          <h3>System prompt</h3>
          <span className="badge">Shared across stages</span>
        </div>
        <p className="card-description">
          Set your agent’s role, tone, and rules for every conversation.
        </p>
        <textarea
          className="prompt-input shared-prompt"
          aria-label="Shared system prompt"
          value={workflow.shared_prompt}
          onChange={(e) => change(["shared_prompt"], e.target.value)}
          spellCheck={false}
        />
        <div className="card-footnote">
          <Code2 size={12} /> Changes sync to your YAML definition.
        </div>
      </section>
      <section className="config-card">
        <div className="card-heading">
          <GitBranch size={16} />
          <h3>Conversation stages</h3>
          <span className="badge">
            {Object.keys(workflow.nodes).length} stages
          </span>
        </div>
        <p className="card-description">
          Each stage has its own instructions and capabilities. Edit transitions
          in YAML.
        </p>
        <div className="stage-config">
          <div
            className="stage-selector"
            role="tablist"
            aria-label="Conversation stages"
          >
            {Object.entries(workflow.nodes).map(([id, n], i) => (
              <button
                role="tab"
                aria-selected={id === nodeId}
                className={id === nodeId ? "selected" : ""}
                key={id}
                onClick={() => onSelect(id)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {n.title || id}
                <small>
                  {n.kind === "action"
                    ? "Action"
                    : n.kind === "end"
                      ? "End"
                      : ""}
                </small>
              </button>
            ))}
          </div>
          <div className="stage-settings">
            {node && (
              <>
                <div className="stage-settings-title">
                  <strong>{node.title || nodeId}</strong>
                  <span className="badge">{node.kind}</span>
                </div>
                {node.kind === "conversation" ? (
                  <>
                    <label className="input-label">Stage instructions</label>
                    <textarea
                      className="prompt-input stage-prompt"
                      aria-label="Stage instructions"
                      value={node.prompt || ""}
                      onChange={(e) =>
                        change(["nodes", nodeId, "prompt"], e.target.value)
                      }
                      spellCheck={false}
                    />
                  </>
                ) : node.kind === "say" ? (
                  <textarea
                    className="prompt-input"
                    aria-label="Stage spoken text"
                    value={node.text || ""}
                    onChange={(e) =>
                      change(["nodes", nodeId, "text"], e.target.value)
                    }
                  />
                ) : (
                  <div className="stage-readonly">
                    {node.kind === "action" ? (
                      <>
                        <ShieldCheck size={20} />
                        <p>
                          Registered action: <code>{node.tool}</code>
                        </p>
                        <small>
                          The runtime checks required facts and confirmation
                          before dispatch.
                        </small>
                      </>
                    ) : (
                      <p>This stage ends the conversation.</p>
                    )}
                  </div>
                )}
                <div className="stage-properties">
                  <span>
                    Listening <b>{node.patient ? "Patient" : "Standard"}</b>
                  </span>
                  <span>
                    Outgoing transitions <b>{node.edges?.length || 0}</b>
                  </span>
                </div>
                {node.edges?.map((edge) => (
                  <div className="edge-summary" key={edge.id}>
                    <span>↳ {workflow.nodes[edge.to]?.title || edge.to}</span>
                    <small>
                      {edge.condition ||
                        edge.result ||
                        (edge.predicate ? "State condition" : "Next stage")}
                    </small>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>
      <section className="config-card">
        <div className="card-heading">
          <Code2 size={16} />
          <h3>Language models</h3>
          <span className="badge">OpenRouter</span>
        </div>
        <div className="config-grid model-fields">
          <label className="input-label">
            Speaking model
            <input
              value={workflow.models?.speaker || ""}
              onChange={(e) => change(["models", "speaker"], e.target.value)}
              placeholder="google/gemini-3.5-flash"
            />
          </label>
          <label className="input-label">
            Evaluator model
            <input
              value={workflow.models?.evaluator || ""}
              onChange={(e) => change(["models", "evaluator"], e.target.value)}
              placeholder="google/gemini-3.5-flash"
            />
          </label>
        </div>
        <p className="field-help">
          Evaluation runs alongside speaking. Model availability depends on your
          account.
        </p>
      </section>
    </div>
  );
}
