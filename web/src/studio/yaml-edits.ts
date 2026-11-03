import {
  Document,
  isCollection,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Node,
} from "yaml";
import type { DocumentTransaction, EditOperation, TextPatch } from "./types";

type Piece = { text: string; start?: number };
const remedy = " Use raw YAML to edit this construct.";
function parse(source: string) {
  const document = parseDocument(source, { keepSourceTokens: true });
  if (document.errors.length)
    throw new Error("Fix YAML syntax before using the form." + remedy);
  visit(document, (_, node) => {
    if (
      (node && (node as { anchor?: string }).anchor) ||
      (node && node.constructor.name === "Alias")
    )
      throw new Error(
        "YAML anchors and aliases cannot be edited with forms." + remedy,
      );
  });
  return document;
}
function render(
  node: Node,
  source: string,
  from: number,
  to: number,
  scalar: boolean,
): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const line = source.slice(lineStart, from);
  const indent = scalar ? line.match(/^ */)![0].length : line.length;
  const clone = node.clone() as Node;
  clone.commentBefore = undefined;
  const block =
    isScalar(clone) &&
    (clone.type === "BLOCK_LITERAL" || clone.type === "BLOCK_FOLDED");
  // Inline scalar/collection comments are outside range[1]; block header comments are inside it.
  if (!block) clone.comment = undefined;
  const output = new Document();
  if (scalar) output.set("__edit__", clone);
  else output.contents = clone;
  let text = output.toString({ lineWidth: 0 });
  if (scalar) text = text.slice("__edit__: ".length);
  else {
    // Leading comments attached to the first key are outside the container range.
    const rendered = parseDocument(text);
    text = text.slice(rendered.contents?.range?.[0] ?? 0);
  }
  text = text.replace(/\n$/, "").replaceAll("\n", "\n" + " ".repeat(indent));
  if (source.slice(from, to).endsWith("\n")) text += "\n";
  return text.replaceAll("\n", newline);
}
function operationPatch(
  source: string,
  operation: EditOperation,
): TextPatch | null {
  const doc = parse(source);
  const path = [...operation.path];
  if (!path.length) throw new Error("Choose a YAML property to edit." + remedy);
  const current = doc.getIn(path, true);
  const expected = doc.clone();
  if (operation.op === "delete") {
    if (current === undefined) return null;
    expected.deleteIn(path);
  } else {
    if (JSON.stringify(doc.getIn(path)) === JSON.stringify(operation.value))
      return null;
    expected.setIn(path, operation.value);
  }
  let changed: Node;
  let target = current;
  const scalar =
    operation.op === "set" &&
    isScalar(current) &&
    (operation.value === null || typeof operation.value !== "object");
  if (scalar) {
    changed = current.clone() as Node;
    (changed as typeof current).value = operation.value;
  } else {
    // Structural edits serialize only the nearest existing collection, preserving AST comments/styles.
    const parentPath = path.slice(0, -1);
    target = doc.getIn(parentPath, true);
    while (!target && parentPath.length) {
      parentPath.pop();
      target = doc.getIn(parentPath, true);
    }
    if (!isCollection(target))
      throw new Error("This property has no editable YAML container." + remedy);
    const replacement = expected.getIn(parentPath, true);
    if (!isMap(replacement) && !isSeq(replacement))
      throw new Error("Edit the containing YAML manually." + remedy);
    changed = replacement;
  }
  if (!target || !(target as Node).range)
    throw new Error("Cannot locate this YAML value." + remedy);
  const [from, to] = (target as Node).range!;
  const insert = render(changed, source, from, to, scalar);
  const next = source.slice(0, from) + insert + source.slice(to);
  const parsed = parse(next);
  if (
    JSON.stringify(parsed.toJS({ maxAliasCount: 0 })) !==
    JSON.stringify(expected.toJS({ maxAliasCount: 0 }))
  )
    throw new Error(
      "This edit cannot preserve the YAML value safely." + remedy,
    );
  return { from, to, insert };
}
function patchPieces(pieces: Piece[], patch: TextPatch): Piece[] {
  const result: Piece[] = [];
  let cursor = 0;
  let inserted = false;
  for (const piece of pieces) {
    const end = cursor + piece.text.length;
    if (end <= patch.from || cursor >= patch.to) {
      if (!inserted && cursor >= patch.to) {
        result.push({ text: patch.insert });
        inserted = true;
      }
      result.push(piece);
    } else {
      const before = Math.max(0, patch.from - cursor);
      const after = Math.min(piece.text.length, patch.to - cursor);
      if (before)
        result.push({ text: piece.text.slice(0, before), start: piece.start });
      if (!inserted) {
        result.push({ text: patch.insert });
        inserted = true;
      }
      if (after < piece.text.length)
        result.push({
          text: piece.text.slice(after),
          start: piece.start === undefined ? undefined : piece.start + after,
        });
    }
    cursor = end;
  }
  if (!inserted) result.push({ text: patch.insert });
  return result;
}
export function applyTransaction(
  source: string,
  tx: DocumentTransaction,
): { source: string; patches: TextPatch[] } {
  let pieces: Piece[] = [{ text: source, start: 0 }];
  let current = source;
  for (const operation of tx.operations) {
    const patch = operationPatch(current, operation);
    if (!patch) continue;
    pieces = patchPieces(pieces, patch);
    current = pieces.map((piece) => piece.text).join("");
  }
  const patches: TextPatch[] = [];
  let cursor = 0,
    insert = "";
  for (const piece of pieces) {
    if (piece.start === undefined) insert += piece.text;
    else {
      if (cursor !== piece.start || insert)
        patches.push({ from: cursor, to: piece.start, insert });
      cursor = piece.start + piece.text.length;
      insert = "";
    }
  }
  if (cursor < source.length || insert)
    patches.push({ from: cursor, to: source.length, insert });
  return { source: current, patches };
}
