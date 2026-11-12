import { useState } from "react";
import { X } from "lucide-react";
export function TokenList({
  value,
  onChange,
  disabled,
  termName = "recognition term",
  maxTerms = 64,
  maxLength = 100,
}: {
  value: string[];
  onChange: (terms: string[]) => void;
  disabled: boolean;
  termName?: string;
  maxTerms?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const add = (text: string) => {
    const terms = [
      ...new Set([
        ...value,
        ...text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      ]),
    ];
    if (
      terms.length > maxTerms ||
      terms.some((t) => [...t].length > maxLength)
    ) {
      setError(
        `Use ${Number.isFinite(maxTerms) ? `up to ${maxTerms} terms, each` : "terms"} no longer than ${maxLength} characters.`,
      );
      return;
    }
    onChange(terms);
    setDraft("");
    setError("");
  };
  return (
    <div className="recognition-terms">
      <div className="term-tokens">
        {value.map((term, i) => (
          <span key={i}>
            {term}
            <button
              aria-label={`Remove ${termName} ${term}`}
              disabled={disabled}
              onClick={() => onChange(value.filter((_, n) => n !== i))}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          aria-label={`Add ${termName}`}
          disabled={disabled}
          placeholder="Add a term…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.includes("\n")) {
              e.preventDefault();
              add(text);
            }
          }}
        />
      </div>
      <p>Press Enter to add. Paste one term per line to add several.</p>
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function RecognitionTerms(props: {
  value: string[];
  onChange: (terms: string[]) => void;
  disabled: boolean;
}) {
  return <TokenList {...props} />;
}
