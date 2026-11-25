import type { FormatKind } from "@/lib/artifact-formats";
import { validateArtifactContent } from "@/lib/artifact-content";
import { canvasLimits } from "@/lib/canvas/limits";
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
    renders: "GitHub-flavored Markdown: tables, task lists, strikethrough, and autolinks. Raw HTML is skipped. A fenced code block with the language `mermaid` draws as a diagram with the Mermaid format's renderer; if it cannot be drawn, the source shows as code with a short note. Attributes in braces after the language set how it shows: `mermaid {view=split}` shows the source and the diagram side by side (stacked on phones), `{view=code}` only the source, and `{view=preview}`, the default, only the diagram. Any fenced code block takes a caption shown under it, `{caption=\"How a change ships\"}`, and `{wrap=true}` to wrap long lines. Uploaded files embed as ![alt](/api/files/<file id>) on their own line: images, video and audio players, PDFs, and download cards, with a caption from the title and a width option (artifacts_formats_guide explains each form). A paragraph, heading, list item, or quoted line that ends in a color comment, such as <!-- color: red; background: yellow -->, shows in that text color and background (gray, brown, orange, yellow, green, blue, purple, pink, or red, in light and dark). Images from other sites do not load; they show as their alt text. Links must be http, https, or mailto, and open with rel=\"nofollow ugc\".",
    example: "# Billing migration plan\n\n- [x] Dual-write behind `billing.ledger_v2`\n- [ ] Backfill 2025 invoices\n\n| Step | Owner |\n| --- | --- |\n| Backfill | @dana |",
  },
  html: {
    checks: "Must start with <!doctype html>. It is one full page: its styles and scripts are inside it, or in page files it loads by relative path. It is not sanitized, because it only ever runs in a sandbox.",
    renders: "The page itself, running, in a sandboxed frame on a separate page host: one host per artifact, apart from this site, your session, and every other artifact. Inline scripts and styles run. Scripts, styles, fonts, and images may also load from cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh, cdn.tailwindcss.com, code.jquery.com, and Google Fonts, and from the page's own page files (stylesheets, scripts, images, fonts, and data that agents upload with a path such as css/site.css, many in two calls); every other request is refused, forms cannot be posted, and the page cannot open frames or navigate the tab. The page may keep data in the browser (localStorage). Links open in a new tab. Where no page host is set up, the source shows instead. Where pictures of pages are set up, an agent that can edit the page sees it running with artifacts_page_image: a picture of the window, drawn on request in a browser.",
    example: '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>Launch countdown</title>\n  <style>\n    body { margin: 0; display: grid; place-items: center; min-height: 100vh; font: 16px system-ui; }\n    output { font-size: 3rem; font-weight: 700; }\n  </style>\n</head>\n<body>\n  <main>\n    <p>Days until launch</p>\n    <output id="days"></output>\n  </main>\n  <script>\n    const launch = new Date("2027-01-15");\n    document.getElementById("days").textContent = Math.max(0, Math.ceil((launch - Date.now()) / 86400000));\n  </script>\n</body>\n</html>',
    broken: "<h1>Launch countdown</h1>",
  },
  code: {
    checks: "Any non-empty text. `language` (up to 60 characters) labels it.",
    renders: "Monospace, as written, with the language as a caption. There is no syntax highlighting.",
    example: "export function retryAfter(seconds: number): string {\n  return `Try again in ${seconds} s.`;\n}",
  },
  text: {
    checks: "Any non-empty text.",
    renders: "As written, with line breaks kept, in the page's column.",
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
  canvas: {
    checks: `A JSON object with a list of frames that passes validateCanvas: up to ${String(canvasLimits.maxFrames)} frames, each with a unique id, a name, a width from ${String(canvasLimits.minWidth)} to ${count(canvasLimits.maxWidth)}, and a ui spec that passes the ui checks. A frame may also set a least height, its padding, and its place on the board.`,
    renders: "A board of frames, each drawn at its real width with the stout component set. Readers drag to move the board and zoom with its buttons, with Ctrl or ⌘ and the wheel, or with two fingers on a touch screen; Fit shows every frame. A plain scroll or a one-finger swipe always moves the page. On a phone the frames stack in the page, each scaled to fit. A frame with a problem shows a notice in its place and the other frames still render.",
    example: '{ "version": 1, "frames": [{ "id": "home-phone", "name": "Home, phone", "width": 390, "spec": { "version": 1, "root": "page", "elements": { "page": { "type": "Heading", "props": { "text": "Hello" } } } } }] }',
    broken: '{ "version": 1, "frames": [{ "id": "home-phone", "name": "Home, phone", "width": 20, "spec": { "version": 1, "root": "page", "elements": { "page": { "type": "Gauge", "props": {} } } } }] }',
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
