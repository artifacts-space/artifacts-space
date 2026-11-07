"use client";

import { useEffect, useState } from "react";

import type { SyntaxLanguage } from "@/lib/syntax/languages";
import type { SyntaxLine } from "@/lib/syntax/tokens";

interface Highlighted {
  key: string;
  lines: SyntaxLine[];
}

/**
 * The highlighted lines for a code block. Server-highlighted lines are used
 * as they are. Otherwise the browser highlighter loads on demand (a separate
 * chunk, never part of the page bundle) and the block shows plain text until
 * it is ready, or for good when the language is unknown.
 */
export function useHighlightedLines(code: string, language: SyntaxLanguage | null, initial: SyntaxLine[] | null | undefined): SyntaxLine[] | null {
  const key = `${language ?? ""}\u0000${code}`;
  const [highlighted, setHighlighted] = useState<Highlighted | null>(null);
  const needsBrowser = !initial && language !== null;

  useEffect(() => {
    if (!needsBrowser) return undefined;
    let cancelled = false;
    import("@/lib/syntax/highlight-browser")
      .then(({ highlightInBrowser }) => highlightInBrowser(code, language))
      .then((lines) => { if (!cancelled && lines) setHighlighted({ key, lines }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [code, key, language, needsBrowser]);

  if (initial) return initial;
  return highlighted?.key === key ? highlighted.lines : null;
}
