import type { PassageEvidence, SourceManifest } from "./runtime-api";
export function SourceDetails({
  collection,
  name,
  passage,
  onClose,
}: {
  collection: SourceManifest["collections"][number];
  passage: PassageEvidence | null;
  name: string;
  onClose: () => void;
}) {
  return (
    <aside className="source-details">
      <header>
        <div>
          <small>
            {name} · {passage?.document || "Passage"}
          </small>
          <h2>{passage?.heading || "Select a passage"}</h2>
        </div>
        <button aria-label="Close passage" onClick={onClose}>
          ×
        </button>
      </header>
      {passage ? (
        <>
          <p className="passage-text">{passage.text}</p>
          <dl>
            <dt>Collection ID</dt>
            <dd>{collection.id}</dd>
            <dt>Passage ID</dt>
            <dd>{passage.chunk_id}</dd>
            <dt>Content hash</dt>
            <dd>{passage.content_hash}</dd>
            {passage.score > 0 && (
              <>
                <dt>BM25 score</dt>
                <dd>{passage.score}</dd>
              </>
            )}
          </dl>
        </>
      ) : (
        <p>Select a passage to read its complete indexed text.</p>
      )}
    </aside>
  );
}
