import type { StudioDocument } from "./types";
import { documentStatus } from "./project-files";
export function DocumentStatus({ document }: { document: StudioDocument }) {
  return (
    <details className="document-status-menu">
      <summary className="document-status">
        {document.validation.state === "valid" ? "Valid · " : "Draft · "}
        {documentStatus(document)}
      </summary>
      <div>
        <strong>{document.filename}</strong>
        <p>Draft revision {document.revision}</p>
        <p>
          {document.lastValid
            ? `Last valid graph: revision ${document.lastValid.revision}`
            : "No runtime-validated revision yet."}
        </p>
        <p>
          {document.exported
            ? `Last downloaded ${new Date(document.exported.at).toLocaleTimeString()}`
            : "This draft has not been downloaded."}
        </p>
        <p>
          Your browser retains a draft. Export downloads a copy; it does not
          save over your project files.
        </p>
        <p>
          Shared positions and named views use an optional .studio.json file.
          Device preferences and credentials are excluded.
        </p>
      </div>
    </details>
  );
}
