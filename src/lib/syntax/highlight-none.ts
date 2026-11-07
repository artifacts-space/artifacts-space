import type { SyntaxLine } from "./tokens";

/**
 * Outside server components `#syntax-highlight` resolves here: no grammars,
 * no highlighter. The code block highlights itself in the browser instead.
 * The signature matches highlight-server.ts.
 */
export const highlightCode: (code: string, label: string | null | undefined) => SyntaxLine[] | null = () => null;
