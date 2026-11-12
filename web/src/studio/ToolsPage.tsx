import { useState } from "react";
import type { Workflow } from "../workflow";
import type { ToolManifest } from "./tool-manifest";
import { humanizeId } from "./workflow-model";
export function ToolsPage({
  workflow,
  tools,
  onStep,
  onWorkflow,
}: {
  workflow: Workflow;
  tools: ToolManifest[];
  onStep: (id: string) => void;
  onWorkflow: () => void;
}) {
  const [selected, setSelected] = useState("");
  const ids = [
    ...new Set([...(workflow.tools || []), ...tools.map((tool) => tool.name)]),
  ];
  const id = ids.includes(selected) ? selected : ids[0],
    tool = tools.find((item) => item.name === id);
  const actions = Object.entries(workflow.nodes).filter(
    ([, node]) => node.kind === "action" && node.tool === id,
  );
  return (
    <div className="definition-browser">
      <div className="definition-list" aria-label="Registered tools">
        {ids.map((name) => (
          <button
            key={name}
            aria-label={`Inspect ${name} tool`}
            className={name === id ? "selected" : ""}
            onClick={() => setSelected(name)}
          >
            <div>
              <strong>{humanizeId(name)}</strong>
              <span>
                {workflow.tools?.includes(name) ? "In workflow" : "Available"}
              </span>
            </div>
            <code>{name}</code>
            <small>
              {tools.some((item) => item.name === name)
                ? "Registered Python action"
                : "Contract unavailable in this runtime"}
            </small>
          </button>
        ))}
        {!ids.length && (
          <p>
            No Python actions registered. Tools are supplied by your
            application.
          </p>
        )}
        <button className="inspector-link" onClick={onWorkflow}>
          Choose available tools in Workflow settings →
        </button>
      </div>
      <section className="definition-detail" aria-label="Tool details">
        {id ? (
          <>
            <small>PYTHON ACTION</small>
            <header>
              <h3>{humanizeId(id)}</h3>
              <code>{id}</code>
            </header>
            <p>
              Python owns the implementation and result contract. Studio edits
              input mappings and outcome destinations in each action step.
            </p>
            {tool ? (
              <>
                <section>
                  <h4>Inputs</h4>
                  {tool.parameters.length ? (
                    <div className="tool-inputs">
                      {tool.parameters.map((parameter) => (
                        <div key={parameter.name}>
                          <code>{parameter.name}</code>
                          <span>
                            {parameter.type === "boolean" ? "Yes / no" : "Text"}
                            {parameter.required ? " · required" : " · optional"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>This action takes no mapped parameters.</p>
                  )}
                </section>
                <section>
                  <h4>Tool result contract</h4>
                  <p>
                    These result IDs are declared by the registered Python tool.
                  </p>
                  <div className="tool-results">
                    {tool.results.map((result) => (
                      <code
                        key={result}
                        className={result === "unknown" ? "uncertain" : ""}
                      >
                        {result === "unknown" && (
                          <span aria-hidden="true">⚠ </span>
                        )}
                        <span>{result}</span>
                      </code>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <p className="inspector-notice">
                This runtime has no Python contract for this tool. Existing YAML
                bindings can be edited, but connect your application’s runtime
                before testing them.
              </p>
            )}
            <section>
              <h4>Action steps</h4>
              {actions.map(([nodeId, node]) => (
                <div className="tool-step-use" key={nodeId}>
                  <button
                    className="inspector-link"
                    onClick={() => onStep(nodeId)}
                    aria-label={`Open ${node.title || humanizeId(nodeId)}`}
                  >
                    Open {node.title || humanizeId(nodeId)} →
                  </button>
                  {node.confirmation && (
                    <p>
                      Confirmation required · {humanizeId(node.confirmation)}.
                      Edit the rule in Step settings.
                    </p>
                  )}
                </div>
              ))}
              {!actions.length && (
                <p>
                  No action steps use this tool yet. Add an action step in
                  Workflow.
                </p>
              )}
            </section>
          </>
        ) : (
          <p>Select a tool to inspect its contract and uses.</p>
        )}
      </section>
    </div>
  );
}
