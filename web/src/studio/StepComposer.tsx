import { Select } from "../ui/Select";
import { useState } from "react";
import type { Workflow } from "../workflow";
import type { RouteRef } from "./types";
import type { ToolManifest } from "./tool-manifest";
import {
  insertConfiguredStep,
  addConfiguredStep,
  type NewStepSpec,
} from "./editor-commands";
export function StepComposer({
  source,
  workflow,
  route,
  tools,
  onCommit,
  onCancel,
}: {
  source: string;
  workflow: Workflow;
  route?: RouteRef;
  tools: ToolManifest[];
  onCommit: (source: string, nodeId: string) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<NewStepSpec["kind"]>("conversation"),
    [title, setTitle] = useState(""),
    [prompt, setPrompt] = useState(""),
    [condition, setCondition] = useState("");
  const [toolName, setToolName] = useState(""),
    [args, setArgs] = useState<Record<string, string>>({}),
    [requires, setRequires] = useState<string[]>([]),
    [results, setResults] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const [next, setNext] = useState(""),
    [makeFirst, setMakeFirst] = useState(false);
  const tool = tools.find((t) => t.name === toolName),
    available = tools.filter((t) => workflow.tools?.includes(t.name));
  const edge = route
    ? workflow.nodes[route.source]?.edges?.find((e) => e.id === route.edgeId)
    : undefined;
  return (
    <form
      className="step-composer"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          let spec: NewStepSpec;
          if (kind === "conversation")
            spec = { kind, title, prompt, continuation: { condition } };
          else if (kind === "say") spec = { kind, title, text: prompt };
          else if (kind === "end") spec = { kind, title };
          else {
            if (!tool)
              throw new Error("Choose an available registered action.");
            spec = {
              kind,
              title,
              tool,
              arguments: args,
              requires,
              resultDestinations: results,
            };
          }
          const result = route
            ? insertConfiguredStep(source, route, spec)
            : addConfiguredStep(source, spec, next, makeFirst);
          onCommit(result.source, result.nodeId);
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <section>
        <h3>{route ? "Insert a step" : "Add a step"}</h3>
        <p className="inspector-help">
          {route
            ? `${workflow.nodes[route.source].title || route.source} → New step → ${workflow.nodes[edge?.to || ""]?.title || edge?.to}`
            : "Connect this step from an existing step, or make it the first step."}
        </p>
        <label>
          Step type
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as NewStepSpec["kind"]);
              setPrompt("");
            }}
          >
            <option value="conversation">Conversation</option>
            <option value="say">Say an exact message</option>
            <option value="action">Run an action</option>
            {!route && <option value="end">End conversation</option>}
          </Select>
        </label>
        <label>
          Step title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </label>
      </section>
      {kind === "end" ? (
        <p className="inspector-help">Ends the conversation when reached.</p>
      ) : kind !== "action" ? (
        <section>
          <label>
            {kind === "say" ? "Exact message" : "Step prompt"}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={7}
            />
          </label>
          {kind === "conversation" && (
            <label>
              Continue when
              <textarea
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                required
                placeholder="The caller has…"
                rows={3}
              />
            </label>
          )}
          <p className="inspector-help">
            {kind === "say"
              ? "Continues automatically after speaking."
              : "The new conversation waits until this condition matches."}
          </p>
        </section>
      ) : (
        <section>
          <label>
            Registered action
            <Select
              value={toolName}
              onChange={(e) => {
                setToolName(e.target.value);
                setArgs({});
                setResults({});
              }}
              required
            >
              <option value="">Choose an action…</option>
              {available.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </Select>
          </label>
          {!available.length && (
            <p className="inspector-notice">
              No registered action manifest is available. Connect the local
              runtime or edit YAML.
            </p>
          )}
          {tool?.parameters.map((p) => (
            <label key={p.name}>
              {p.name}
              {p.required ? " *" : " (optional)"}
              <Select
                value={args[p.name] || ""}
                onChange={(e) => {
                  setArgs({ ...args, [p.name]: e.target.value });
                  if (e.target.value)
                    setRequires((old) => [
                      ...new Set([...old, e.target.value]),
                    ]);
                }}
                required={p.required}
              >
                <option value="">Choose {p.type} field…</option>
                {Object.entries(workflow.fields || {})
                  .filter(([, f]) => (f.type || "string") === p.type)
                  .map(([id]) => (
                    <option key={id}>{id}</option>
                  ))}
              </Select>
            </label>
          ))}
          <fieldset>
            <legend>Required facts before running</legend>
            {Object.keys(workflow.fields || {}).map((field) => (
              <label className="inspector-check" key={field}>
                <input
                  type="checkbox"
                  checked={requires.includes(field)}
                  onChange={(e) =>
                    setRequires(
                      e.target.checked
                        ? [...requires, field]
                        : requires.filter((f) => f !== field),
                    )
                  }
                />
                {field}
              </label>
            ))}
          </fieldset>
          {tool?.results.map((result) => (
            <label key={result}>
              When result is {result}
              <Select
                value={results[result] || ""}
                required
                onChange={(e) =>
                  setResults({ ...results, [result]: e.target.value })
                }
              >
                <option value="">Choose destination…</option>
                {Object.entries(workflow.nodes).map(([id, n]) => (
                  <option key={id} value={id}>
                    {n.title || id}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </section>
      )}
      {!route && (
        <section>
          {(kind === "conversation" || kind === "say") && (
            <label>
              Go to after this step
              <Select
                value={next}
                onChange={(event) => setNext(event.target.value)}
                required
              >
                <option value="">Choose destination…</option>
                {Object.entries(workflow.nodes).map(([id, node]) => (
                  <option key={id} value={id}>
                    {node.title || id}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="inspector-check">
            <input
              type="checkbox"
              checked={makeFirst}
              onChange={(event) => setMakeFirst(event.target.checked)}
            />
            Make this the first step
          </label>
        </section>
      )}
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
      <footer className="composer-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button black" type="submit">
          Add step →
        </button>
      </footer>
    </form>
  );
}
