import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
const extensions = [yaml()];
export default function YamlCode({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      height="100%"
      aria-label="Agent YAML configuration"
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
      }}
      theme="light"
    />
  );
}
