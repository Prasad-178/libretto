import { useEffect, useMemo, useRef } from "react";
import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import type { WorkflowIssue } from "./studio/types";
export type CodeJump = { from: number; to?: number; nonce?: number };
export default function YamlCode({
  value,
  onChange,
  issues = [],
  jump,
  readOnly = false,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  issues?: WorkflowIssue[];
  jump?: CodeJump | null;
  readOnly?: boolean;
  onBlur?: () => void;
}) {
  const editor = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () => [
      yaml(),
      lintGutter(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "Agent YAML configuration",
      }),
      EditorView.domEventHandlers({
        blur: () => {
          onBlur?.();
        },
      }),
    ],
    [onBlur],
  );
  function diagnostics(view: EditorView) {
    view.dispatch(
      setDiagnostics(
        view.state,
        issues
          .filter((i) => i.from !== undefined)
          .map((i) => ({
            from: Math.min(value.length, i.from!),
            to: Math.min(value.length, i.to ?? i.from!),
            severity: i.severity,
            message: i.message,
          })),
      ),
    );
  }
  function move(view: EditorView) {
    if (!jump) return;
    const from = Math.max(0, Math.min(view.state.doc.length, jump.from)),
      to = Math.max(from, Math.min(view.state.doc.length, jump.to ?? from));
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
  }
  useEffect(() => {
    if (editor.current?.view) diagnostics(editor.current.view);
  }, [issues, value]);
  useEffect(() => {
    if (editor.current?.view) move(editor.current.view);
  }, [jump]);
  return (
    <CodeMirror
      ref={editor}
      className="yaml-code"
      value={value}
      onChange={onChange}
      extensions={extensions}
      height="100%"
      editable={!readOnly}
      readOnly={readOnly}
      onCreateEditor={(view) => {
        diagnostics(view);
        move(view);
      }}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
        history: false,
      }}
      theme="light"
    />
  );
}
