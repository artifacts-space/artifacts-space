import type { SyntaxLanguage } from "./languages";
import type { SyntaxLine, SyntaxToken } from "./tokens";

/**
 * Shell reads in one color. The grammar marks every unquoted argument as a
 * string, which paints a command mostly green with no meaning behind it, so
 * shell keeps only comments and a leading prompt dimmed.
 */

const promptPattern = /^[$>] /;
const promptLinePattern = /^[$>] /gm;

/** True for the shell grammar, which every shell alias (bash, sh, zsh, console) resolves to. */
export function isShellLanguage(language: SyntaxLanguage | null): boolean {
  return language === "shellscript";
}

/** Merges neighbors of the same kind, so a line sends as few spans as it can. */
function mergeLine(line: SyntaxLine): SyntaxLine {
  const merged: SyntaxLine = [];
  for (const token of line) {
    const previous = merged.at(-1);
    if (previous?.kind === token.kind) {
      previous.text += token.text;
      continue;
    }
    merged.push({ ...token });
  }
  return merged;
}

/** Splits a leading `$ ` or `> ` prompt off a plain first token and dims it like a comment. */
function dimPrompt(line: SyntaxLine): SyntaxLine {
  const [first, ...rest] = line;
  if (first?.kind !== null || !promptPattern.test(first.text)) return line;
  const remainder = first.text.slice(2);
  const prompt: SyntaxToken = { text: first.text.slice(0, 2), kind: "comment" };
  return remainder ? [prompt, { text: remainder, kind: null }, ...rest] : [prompt, ...rest];
}

/**
 * Shell lines in the code foreground: every token but comments loses its
 * color, and a leading prompt is dimmed.
 */
export function shellLines(lines: readonly SyntaxLine[]): SyntaxLine[] {
  return lines.map((line) => dimPrompt(mergeLine(line.map((token) => ({ text: token.text, kind: token.kind === "comment" ? "comment" : null })))));
}

/** Shell code as people paste it: a leading `$ ` or `> ` prompt is dropped from every line. */
export function stripShellPrompts(code: string): string {
  return code.replace(promptLinePattern, "");
}
