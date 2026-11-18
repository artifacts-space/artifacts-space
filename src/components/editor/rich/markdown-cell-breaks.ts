import { isLineBreakTag } from "@/lib/markdown/cell-breaks";

/** The fields of a marked token the cell rules read. */
interface CellToken {
  type?: string;
  raw?: string;
  text?: string;
  tokens?: CellToken[];
}

/** A table token as marked gives it: a header row and body rows of cells. */
interface TableToken extends Record<string, unknown> {
  type: "table";
  header?: CellToken[];
  rows?: CellToken[][];
}

/** Inline tokens with each `<br>` tag, at any depth, as marked's line break token. */
function withBreakTokens(tokens: readonly CellToken[]): CellToken[] {
  return tokens.map((token) => {
    if (token.type === "html" && isLineBreakTag(token.raw ?? token.text ?? "")) return { type: "br", raw: token.raw ?? "<br>" };
    return token.tokens ? { ...token, tokens: withBreakTokens(token.tokens) } : token;
  });
}

function withCellBreak(cell: CellToken): CellToken {
  return cell.tokens ? { ...cell, tokens: withBreakTokens(cell.tokens) } : cell;
}

/** True for a marked table token. */
export function isTableToken(value: unknown): value is TableToken {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "table";
}

/**
 * A table token whose cells read `<br>` as a line break (cell-breaks.ts),
 * so the editor loads `one<br>two` as two lines and the block is no longer
 * kept as written for its HTML. Any other HTML in a cell stays HTML.
 */
export function withCellBreaks<T extends TableToken>(token: T): T {
  return {
    ...token,
    ...(token.header ? { header: token.header.map(withCellBreak) } : {}),
    ...(token.rows ? { rows: token.rows.map((row) => row.map(withCellBreak)) } : {}),
  };
}
