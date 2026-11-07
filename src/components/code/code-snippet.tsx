import { highlightCode } from "#syntax-highlight";

import { CodeBlock } from "./code-block";

/** Props for a code sample in the docs or the setup screens. */
export interface CodeSnippetProps {
  code: string;
  /** The language label, such as "json" or "toml". Without one the code shows as plain text. */
  language?: string | undefined;
  /** An optional title at the left of the header, such as "mcp.json". */
  title?: string | undefined;
  /** Wraps long lines instead of scrolling sideways. */
  wrap?: boolean;
  className?: string | undefined;
}

/**
 * A code sample in the shared code block. In a server component (the docs)
 * it arrives highlighted, with no highlighter in the page; in a client
 * component (Connections, dialogs) the block highlights itself on demand.
 */
export function CodeSnippet({ code, language, title, wrap = false, className }: CodeSnippetProps) {
  return <CodeBlock code={code} language={language} title={title} wrap={wrap} className={className} lines={highlightCode(code, language)} />;
}

/** Props for one shell command. */
export interface CommandSnippetProps {
  command: string;
  /** The shell language. Defaults to "bash". */
  language?: string | undefined;
  /** The copy button's accessible name, such as "Copy skill command". */
  copyLabel?: string | undefined;
  className?: string | undefined;
}

/**
 * One shell command on a compact row, after a `$` prompt that is never
 * copied. Highlighted on the server where it can be, like CodeSnippet.
 */
export function CommandSnippet({ command, language = "bash", copyLabel, className }: CommandSnippetProps) {
  return <CodeBlock variant="command" code={command} language={language} copyLabel={copyLabel} className={className} lines={highlightCode(command, language)} />;
}
