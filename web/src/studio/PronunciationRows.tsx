import { useEffect, useState } from "react";
import { X } from "lucide-react";
type Row = { word: string; say_as: string };
export function PronunciationRows({
  value,
  disabled,
  onChange,
  onHistoryEnd,
}: {
  value: Row[];
  disabled: boolean;
  onChange: (rows: Row[], group?: string) => void;
  onHistoryEnd: () => void;
}) {
  const [adding, setAdding] = useState(false),
    [word, setWord] = useState(""),
    [sayAs, setSayAs] = useState(""),
    [error, setError] = useState("");
  const valid = (row: Row, index = -1) => {
    if (!row.word.trim() || !row.say_as.trim())
      return "Enter both the word and how to say it.";
    if ([...row.word].length > 100 || [...row.say_as].length > 200)
      return "Use up to 100 characters for the word and 200 for how to say it.";
    if (value.some((v, i) => i !== index && v.word === row.word))
      return "This word already has a pronunciation. Edit the existing rule.";
    return "";
  };
  return (
    <section className="pronunciation-settings">
      <h3>Pronunciations</h3>
      <p>Tell the voice how to say specific words.</p>
      <div className="pronunciation-columns">
        <span>Word</span>
        <span>Say as</span>
        <span />
      </div>
      {value.map((row, index) => (
        <PronunciationRow
          key={index}
          row={row}
          index={index}
          disabled={disabled}
          onHistoryEnd={onHistoryEnd}
          onCommit={(next) => {
            const problem = valid(next, index);
            if (!problem) {
              onChange(
                value.map((v, i) => (i === index ? next : v)),
                `pronunciation:${index}`,
              );
              setError("");
            } else
              setError(`${problem} Changes to this row have not been saved.`);
          }}
          onRemove={() => {
            onChange(value.filter((_, i) => i !== index));
            setError("");
          }}
        />
      ))}
      {adding ? (
        <div className="new-pronunciation">
          <input
            aria-label="New pronunciation word"
            value={word}
            disabled={disabled}
            onChange={(e) => setWord(e.target.value)}
          />
          <input
            aria-label="New pronunciation say as"
            value={sayAs}
            disabled={disabled}
            onChange={(e) => setSayAs(e.target.value)}
          />
          <button
            className="button"
            disabled={disabled}
            onClick={() => {
              const row = { word, say_as: sayAs },
                problem = valid(row);
              if (problem) {
                setError(`${problem} Changes to this row have not been saved.`);
                return;
              }
              onChange([...value, row]);
              setAdding(false);
              setWord("");
              setSayAs("");
              setError("");
            }}
          >
            Save pronunciation
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setError("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          aria-label="Add pronunciation"
          disabled={disabled || value.length >= 64}
          onClick={() => setAdding(true)}
        >
          + Add pronunciation
        </button>
      )}
      {error && (
        <p className="inspector-error" role="alert">
          {error}
        </p>
      )}
      <p>
        Applied only to spoken audio. Original text stays unchanged. Literal,
        case-sensitive words; longer matches win.
      </p>
    </section>
  );
}
function PronunciationRow({
  row,
  index,
  disabled,
  onCommit,
  onRemove,
  onHistoryEnd,
}: {
  row: Row;
  index: number;
  disabled: boolean;
  onCommit: (row: Row) => void;
  onRemove: () => void;
  onHistoryEnd: () => void;
}) {
  const [word, setWord] = useState(row.word),
    [sayAs, setSayAs] = useState(row.say_as);
  useEffect(() => {
    setWord(row.word);
    setSayAs(row.say_as);
  }, [row.word, row.say_as]);
  return (
    <div
      className="pronunciation-row"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          if (word !== row.word || sayAs !== row.say_as)
            onCommit({ word, say_as: sayAs });
          onHistoryEnd();
        }
      }}
    >
      <input
        aria-label={`Pronunciation word ${index + 1}`}
        disabled={disabled}
        value={word}
        onChange={(e) => setWord(e.target.value)}
      />
      <input
        aria-label={`Pronunciation say as ${index + 1}`}
        disabled={disabled}
        value={sayAs}
        onChange={(e) => setSayAs(e.target.value)}
      />
      <button
        aria-label={`Remove pronunciation ${index + 1}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X size={16} />
      </button>
    </div>
  );
}
