/** What people and agents are told about one artifact format. */
export interface FormatInfo {
  /** Short display name. */
  label: string;
  /** One helper line under the format picker. */
  helper: string;
  /** One line for agents choosing a format. */
  agent: string;
}

/** Every artifact format, in picker order. Server-safe: no React, no icons. */
export const formatKinds = ["markdown", "code", "text", "json", "csv", "svg", "mermaid", "ui", "file"] as const;
export type FormatKind = (typeof formatKinds)[number];

export const formatInfo: Record<FormatKind, FormatInfo> = {
  markdown: {
    label: "Markdown",
    helper: "Readable prose with headings, lists, tables, and links.",
    agent: "GitHub-flavored Markdown, shown as formatted prose. Raw HTML is not rendered.",
  },
  code: {
    label: "Code",
    helper: "Source code in monospace. Set the language to label it.",
    agent: "Source code shown in monospace. Set `language`, for example typescript.",
  },
  text: {
    label: "Text",
    helper: "Plain text, shown as written.",
    agent: "Plain text, shown as written.",
  },
  json: {
    label: "JSON",
    helper: "Data, pretty-printed. The content must be valid JSON.",
    agent: "A JSON document, pretty-printed. It must parse.",
  },
  csv: {
    label: "CSV",
    helper: "A table. The first row names the columns.",
    agent: "CSV (RFC 4180) with a header row, shown as a table of up to 1,000 rows.",
  },
  svg: {
    label: "SVG",
    helper: "A vector image. Scripts inside it never run.",
    agent: "An SVG document that starts with <svg>. Shown as an image: scripts and external loads never run.",
  },
  mermaid: {
    label: "Mermaid",
    helper: "A diagram drawn from Mermaid source.",
    agent: "Mermaid diagram source that starts with its type, such as flowchart TD or sequenceDiagram.",
  },
  ui: {
    label: "Interface",
    helper: "A rich page, such as a dashboard or report, built from our components.",
    agent: "A json-render spec on the artifacts.space component set: dashboards, reports, checklists. Read artifacts_formats_guide with kind \"ui\" before writing one.",
  },
  file: {
    label: "Files",
    helper: "Images, PDFs, documents, video, and audio, with optional notes.",
    agent: "Uploaded files with optional Markdown notes as content. Create one with files_create_artifact after uploading (files_request_upload, PUT, files_finalize).",
  },
};
