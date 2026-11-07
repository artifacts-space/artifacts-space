/**
 * Small, pure helpers for writing Markdown safely: fences that the content
 * cannot close, one-line text for headings and table cells, and GitHub
 * Markdown tables.
 */

const backtickRuns = /`+/g;

/**
 * A fenced code block whose fence is longer than any run of backticks in
 * `code`, so the content can never close it early.
 */
export function fenced(code: string, info = ""): string {
  let longest = 0;
  for (const match of code.matchAll(backtickRuns)) longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  const body = code.endsWith("\n") ? code : `${code}\n`;
  return `${fence}${inlineText(info)}\n${body}${fence}`;
}

/** Text on one line: every run of whitespace, line breaks included, becomes one space. */
export function inlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Text for a GitHub Markdown table cell: one line, with pipes escaped. */
export function tableCell(value: string): string {
  return inlineText(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

/** Text for the label of a Markdown link: one line, with brackets escaped. */
export function linkLabel(value: string): string {
  return inlineText(value).replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

/** A URL that is safe inside Markdown link parentheses. */
export function linkTarget(url: string): string {
  return url.replace(/[\s()<>]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

/** A Markdown link. */
export function link(label: string, url: string): string {
  return `[${linkLabel(label) || linkTarget(url)}](${linkTarget(url)})`;
}

/**
 * A GitHub Markdown table. Rows shorter than the header are padded and
 * longer ones are cut, so every row has the header's column count.
 */
export function markdownTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  if (header.length === 0) return "";
  const cell = (value: string | undefined) => tableCell(value ?? "") || " ";
  const line = (cells: readonly (string | undefined)[]) => `| ${header.map((_, index) => cell(cells[index])).join(" | ")} |`;
  return [line(header), `| ${header.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

/** Indents every line after the first, so a multi-line value stays inside its list item. */
export function indentContinuation(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line, index) => (index === 0 || line === "" ? line : `${pad}${line}`))
    .join("\n");
}

/** Prefixes every line with "> ", for a blockquote. */
export function quoted(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}
