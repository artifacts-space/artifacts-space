import { resolveLanguage, type SyntaxLanguage } from "@/lib/syntax/languages";
import { isShellLanguage, stripShellPrompts } from "@/lib/syntax/shell";

/** What a code block shows and copies, decided from its props. */
export interface CodeBlockModel {
  /** The header label: the language as given, or "text". */
  label: string;
  /** The highlighter language, or null for plain text. */
  language: SyntaxLanguage | null;
  /** The code as shown: one trailing newline dropped, so the block has no empty last line. */
  display: string;
  /** Exactly what the copy button writes: the code as given, minus shell prompts. */
  copyValue: string;
}

/** Decides a code block's label, language, shown text, and copied text. */
export function codeBlockModel(code: string, language: string | null | undefined): CodeBlockModel {
  const label = language?.trim().replace(/^language-/, "") ?? "";
  const resolved = resolveLanguage(label);
  return {
    label: label === "" ? "text" : label,
    language: resolved,
    display: code.endsWith("\n") ? code.slice(0, -1) : code,
    copyValue: isShellLanguage(resolved) ? stripShellPrompts(code) : code,
  };
}
