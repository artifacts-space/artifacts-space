import type { FormatKind } from "@/lib/artifact-formats";
import { validateArtifactContent } from "@/lib/artifact-content";
import { csvColumnCap, csvRowCap } from "@/lib/csv-limits";
import { maxMermaidLength } from "@/lib/mermaid-source";

/**
 * How each artifact format is checked and shown, for the Formats page. The
 * Record type makes a new format fail the typecheck until it is documented.
 * Error messages are computed from the real validator, never copied.
 */
export interface FormatDoc {
  /** What must be true for the content to save. */
  checks: string;
  /** How the artifact page shows it. */
  renders: string;
  /** A small valid example. */
  example: string;
  /** Content that fails the check, to show the real message. */
  broken?: string;
}

const count = (value: number) => value.toLocaleString("en-US");

export const formatDocs: Record<FormatKind, FormatDoc> = {
  markdown: {
    checks: "Any non-empty text.",
    renders: "GitHub-flavored Markdown: tables, task lists, strikethrough, and autolinks. Raw HTML is skipped. Uploaded files embed as ![alt](/api/files/<file id>) on their own line: images, video and audio players, PDFs, and download cards, with a caption from the title and a width option (artifacts_formats_guide explains each form). Images from other sites do not load; they show as their alt text. Links must be http, https, or mailto, and open with rel=\"nofollow ugc\".",
    example: "# Billing migration plan\n\n- [x] Dual-write behind `billing.ledger_v2`\n- [ ] Backfill 2025 invoices\n\n| Step | Owner |\n| --- | --- |\n| Backfill | @dana |",
  },
  code: {
    checks: "Any non-empty text. `language` (up to 60 characters) labels it.",
    renders: "Monospace, as written, with the language as a caption. There is no syntax highlighting.",
    example: "export function retryAfter(seconds: number): string {\n  return `Try again in ${seconds} s.`;\n}",
  },
  text: {
    checks: "Any non-empty text.",
    renders: "As written, with line breaks kept, at reading width.",
    example: "Standup notes, 6 Nov\nShipped: docs shell\nNext: MCP reference",
  },
  json: {
    checks: "Must parse as JSON.",
    renders: "Pretty-printed with two-space indent. Content that does not parse shows as written, under a warning.",
    example: '{ "service": "billing", "p95Ms": 182, "regions": ["eu-west-1", "us-east-1"] }',
    broken: '{ "service": "billing", }',
  },
  csv: {
    checks: "RFC 4180 CSV with a header row. Quotes must close.",
    renders: `A table with row numbers and a sticky header. Readers sort by clicking a column header and filter from the search box or a column's menu; neither changes the file. Shows up to ${count(csvRowCap)} rows and ${String(csvColumnCap)} columns and says how many it left out. Editors get a spreadsheet-style grid, with a Raw view for the text.`,
    example: "service,p95_ms,errors\nbilling,182,3\nsearch,95,0",
    broken: 'service,note\nbilling,"never closed',
  },
  svg: {
    checks: "Must start with an <svg> element (an XML declaration or comments may come first) and close with </svg>. It is not sanitized, because it is only ever shown as an image.",
    renders: "An <img> with a data: URI on a checkerboard. Scripts, event handlers, and external loads never run. A missing xmlns is added.",
    example: '<svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg">\n  <rect width="120" height="40" rx="8" fill="#1f6feb"/>\n  <text x="60" y="26" text-anchor="middle" fill="#fff">ready</text>\n</svg>',
    broken: '<div>not an svg</div>',
  },
  mermaid: {
    checks: `Up to ${count(maxMermaidLength)} characters, and the first line (after front matter and %% comments) must name a diagram type. Finer syntax errors show when it renders.`,
    renders: "Mermaid loads in the browser only when needed and draws in strict security mode with plain-text labels. The result shows as an image, so nothing in it can run.",
    example: "flowchart LR\n  agent[Coding agent] -->|artifacts_create| server[MCP server]\n  server --> page[Artifact page]",
    broken: "agent --> server",
  },
  ui: {
    checks: "A JSON Render spec that passes validateUiSpec: known components, valid props, a tree from the root, and the size limits.",
    renders: "The stout component set, the same for every reader. Links follow the link policy and images come only from the artifact's own files.",
    example: '{ "version": 1, "root": "page", "elements": { "page": { "type": "Heading", "props": { "text": "Hello" } } } }',
    broken: '{ "version": 1, "root": "page", "elements": { "page": { "type": "Gauge", "props": {} } } }',
  },
  file: {
    checks: "Content is optional Markdown notes. Files are uploaded first, then attached.",
    renders: "The notes as Markdown, then each file: images inline, PDFs in the browser's viewer, video and audio in players, and a download card for every file. Every file URL is access-checked.",
    example: "Screenshots from the 6 Nov design review. The second one shows the empty state.",
  },
};

/** The real message the server returns for a format's broken example, or null. */
export function formatErrorMessage(kind: FormatKind): string | null {
  const broken = formatDocs[kind].broken;
  if (broken === undefined) return null;
  const checked = validateArtifactContent(kind, broken);
  return checked.valid ? null : checked.message;
}
