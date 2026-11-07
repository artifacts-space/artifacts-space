import type { HighlighterCore } from "shiki/core";

import type { SyntaxLanguage } from "./languages";
import { syntaxThemeName } from "./theme";
import { toSyntaxLines, withinHighlightLimits, type SyntaxLine } from "./tokens";

/**
 * Runs `work` with `Date.now` stubbed. Shiki's tokenizer reads the clock on
 * every line, even with its time limit off, and Next.js refuses a clock read
 * while it prerenders a page. The size limits bound the work instead, and the
 * stub is synchronous, so nothing else runs while it is in place.
 */
function withoutClock<T>(work: () => T): T {
  const original = Object.getOwnPropertyDescriptor(Date, "now");
  if (!original) return work();
  Object.defineProperty(Date, "now", { ...original, value: () => 0 });
  try {
    return work();
  } finally {
    Object.defineProperty(Date, "now", original);
  }
}

/**
 * Highlights code with a ready highlighter. Returns null when the code is
 * too large or the grammar fails, so the caller shows plain text.
 */
export function tokenize(highlighter: HighlighterCore, code: string, language: SyntaxLanguage): SyntaxLine[] | null {
  if (!withinHighlightLimits(code)) return null;
  try {
    const tokens = withoutClock(() => highlighter.codeToTokensBase(code, { lang: language, theme: syntaxThemeName, tokenizeTimeLimit: 0 }));
    return toSyntaxLines(tokens);
  } catch {
    return null;
  }
}
