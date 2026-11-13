/*
 * Footnotes as the read view (remark-gfm) finds them: a definition, `[^id]:`
 * at the start of a line, and a reference, `[^id]`, only where a definition
 * with that label exists. Code spans and code blocks never hold either, so
 * a pattern such as `[^a-z]` in code is just code.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Fields of a marked token that hold child tokens (`nestedTokens`: a task item's blocks). */
export const childFields = ["tokens", "items", "header", "rows", "nestedTokens"] as const;

const codeTypes: ReadonlySet<string> = new Set(["code", "codespan"]);

function children(token: Record<string, unknown>): unknown[] | null {
  const found = childFields.flatMap((field) => (Array.isArray(token[field]) ? [token[field] as unknown[]] : []));
  return found.length > 0 ? found.flat() : null;
}

/** A token whose own source is read whole: marked turns `[^id]` into a link when `[^id]: text` is a link definition, and a definition has no children. */
const wholeTypes: ReadonlySet<string> = new Set(["link", "image", "def"]);

/** A token's text outside code, as written, with its blocks on lines of their own. */
export function proseOf(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => proseOf(item)).join("");
  if (!isRecord(value)) return "";
  const type = typeof value.type === "string" ? value.type : "";
  if (codeTypes.has(type)) return "\n";
  const raw = typeof value.raw === "string" ? value.raw : "";
  if (wholeTypes.has(type)) return type === "def" ? `\n${raw}\n` : raw;
  const nested = children(value);
  return nested ? `${proseOf(nested)}\n` : raw;
}

const definitionLine = /(?:^|\n)[ \t]*\[\^([^\]\s]+)\]:/g;
const reference = /(?<!\\)\[\^([^\]\s]+)\]/g;

/** The labels of the footnote definitions in the tokens, in lower case. */
export function footnoteLabels(tokens: readonly unknown[]): Set<string> {
  return new Set([...proseOf(tokens).matchAll(definitionLine)].map((match) => (match[1] ?? "").toLowerCase()));
}

/** True when the token holds a footnote definition, or a reference to one of `labels`. */
export function usesFootnotes(token: unknown, labels: ReadonlySet<string>): boolean {
  const prose = proseOf(token);
  if (new RegExp(definitionLine.source).test(prose)) return true;
  return [...prose.matchAll(reference)].some((match) => labels.has((match[1] ?? "").toLowerCase()));
}
