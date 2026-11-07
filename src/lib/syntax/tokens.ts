/** The token kinds code blocks color. Each maps to a `--syntax-<kind>` color token in globals.css. */
export const syntaxKinds = ["keyword", "string", "comment", "number", "function", "property", "punctuation", "inserted", "deleted"] as const;

export type SyntaxKind = (typeof syntaxKinds)[number];

/** A run of text in one color. `kind` null means the code block's foreground. */
export interface SyntaxToken {
  text: string;
  kind: SyntaxKind | null;
}

/** One highlighted line. */
export type SyntaxLine = SyntaxToken[];

/** The shape of a Shiki token this module reads. */
export interface RawToken {
  content: string;
  color?: string | undefined;
}

const kindSet: ReadonlySet<string> = new Set(syntaxKinds);
const variablePattern = /^var\(--syntax-([a-z]+)\)$/;

function isSyntaxKind(value: string): value is SyntaxKind {
  return kindSet.has(value);
}

/** The kind behind a theme color such as `var(--syntax-keyword)`, or null for anything else. */
export function kindFromColor(color: string | undefined): SyntaxKind | null {
  const name = color ? variablePattern.exec(color)?.[1] : undefined;
  return name !== undefined && isSyntaxKind(name) ? name : null;
}

/**
 * Turns Shiki's tokens into compact lines: each token's color becomes a kind,
 * and neighbors of the same kind merge, so the page sends fewer spans.
 */
export function toSyntaxLines(lines: readonly (readonly RawToken[])[]): SyntaxLine[] {
  return lines.map((line) => {
    const merged: SyntaxLine = [];
    for (const token of line) {
      const kind = kindFromColor(token.color);
      const previous = merged.at(-1);
      if (previous?.kind === kind) {
        previous.text += token.content;
        continue;
      }
      merged.push({ text: token.content, kind });
    }
    return merged;
  });
}

/** Code past either limit shows as plain text, so a huge file never stalls a render. */
export const highlightLimits = { characters: 100_000, lines: 3_000 } as const;

/** True when code is small enough to highlight. */
export function withinHighlightLimits(code: string): boolean {
  if (code.length > highlightLimits.characters) return false;
  let lines = 1;
  for (const character of code) {
    if (character === "\n") lines += 1;
    if (lines > highlightLimits.lines) return false;
  }
  return true;
}
