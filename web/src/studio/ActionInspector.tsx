import { Select } from "../ui/Select";
import { useEffect, useState } from "react";
import type { Workflow } from "../workflow";
import type { DocumentTransaction } from "./types";
import type { ToolManifest } from "./tool-manifest";
import { validateAction } from "./editor-commands";
export function ActionInspector({
  workflow,
  nodeId,
  tools,
  onTransaction,
}: {
  workflow: Workflow;
  nodeId: string;
  tools: ToolManifest[];
  onTransaction: (tx: DocumentTransaction) => void;
}) {
  const node = workflow.nodes[nodeId];
  const [toolName, setToolName] = useState(node.tool || ""),
    [args, setArgs] = useState(node.arguments || {}),
    [requires, setRequires] = useState(node.requires || []),
    [results, setResults] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    setToolName(node.tool || "");
    setArgs(node.arguments || {});
    setRequires(node.requires || []);
    setResults(
      Object.fromEntries(
        (node.edges || [])
          .filter((e) => e.result)
          .map((e) => [e.result!, e.to]),
      ),
    );
  }, [node]);
  const tool = tools.find((t) => t.name === toolName);
  return (
    <section>
      <h3>Action configuration</h3>
      <label>
        Registered action
        <Select
          value={toolName}
          onChange={(e) => {
            setToolName(e.target.value);
            setArgs({});
            setResults({});
          }}
        >
          <option value={node.tool || ""}>
            {node.tool || "Choose action…"}
          </option>
          {tools
            .filter(
              (t) => t.name !== node.tool && workflow.tools?.includes(t.name),
            )
            .map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
        </Select>
      </label>
      {!tool ? (
        <p className="inspector-notice">
          The runtime has no manifest for this action. Its YAML is preserved;
          connect a runtime that registers it to edit mappings.
        </p>
      ) : (
        <>
          {tool.parameters.map((p) => (
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
              >
                <option value="">Choose {p.type} field…</option>
                {Object.entries(workflow.fields || {})
                  .filter(([, f]) => f.type === p.type)
                  .map(([field]) => (
                    <option key={field}>{field}</option>
                  ))}
              </Select>
            </label>
          ))}
          <h4>Required facts</h4>
          {Object.keys(workflow.fields || {}).map((field) => (
            <label key={field} className="inspector-check">
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
          <h4>Results</h4>
          {tool.results.map((result) => (
            <label key={result}>
              {result}
              <Select
                value={results[result] || ""}
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
          <button
            className="button"
            onClick={() => {
              try {
                validateAction(workflow, tool, args, requires, results);
                const used = new Set<string>();
                const edges = tool.results.map((result, i) => {
                  const existing = node.edges.find((e) => e.result === result);
                  let id = existing?.id || `result_${i + 1}`;
                  while (used.has(id)) id += "_";
                  used.add(id);
                  return { ...existing, id, to: results[result], result };
                });
                onTransaction({
                  label: "Configure action",
                  operations: [
                    {
                      op: "set",
                      path: ["nodes", nodeId, "tool"],
                      value: tool.name,
                    },
                    {
                      op: "set",
                      path: ["nodes", nodeId, "arguments"],
                      value: Object.fromEntries(
                        Object.entries(args).filter(([, field]) => field),
                      ),
                    },
                    {
                      op: "set",
                      path: ["nodes", nodeId, "requires"],
                      value: requires,
                    },
                    {
                      op: "set",
                      path: ["nodes", nodeId, "edges"],
                      value: edges,
                    },
                  ],
                });
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Apply action configuration
          </button>
        </>
      )}
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
