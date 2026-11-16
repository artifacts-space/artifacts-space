import { artifactKinds, type ArtifactKind } from "./artifact-types";

/** What people and agents are told about one artifact format. */
export interface FormatInfo {
  /** Short display name. */
  label: string;
  /** One helper line under the format picker. */
  helper: string;
  /** One line for agents choosing a format. */
  agent: string;
}

/** Every artifact format, in picker order: the one list in artifact-types.ts. Server-safe: no React, no icons. */
export const formatKinds = artifactKinds;
export type FormatKind = ArtifactKind;


/**
 * Where new visual work goes (the owner's decision, 16 Nov 2026): an HTML
 * page. The interface and canvas formats stay for the artifacts that use
 * them, and agents are no longer pointed at them for new work.
 */
export const newVisualWork = 'For a new mockup, dashboard, or report, prefer kind "html", a full web page.';

/** The same, for the opening of the two earlier formats' guides. */
export const earlierFormatNote = `This is an earlier format, kept for the artifacts that use it. ${newVisualWork} Call artifacts_formats_guide with kind "html" for its rules.`;
export const formatInfo: Record<FormatKind, FormatInfo> = {
  markdown: {
    label: "Markdown",
    helper: "Readable prose with headings, lists, tables, and links.",
    agent: "GitHub-flavored Markdown, shown as formatted prose. Raw HTML is not rendered. A fenced code block with the language `mermaid` draws as a diagram, so keep diagrams in the document. Uploaded images, video, audio, and files embed as ![alt](/api/files/<file id>) on its own line; artifacts_formats_guide with kind \"markdown\" explains how.",
  },
  html: {
    label: "HTML",
    helper: "A web page with its own styles and scripts. It runs in a sandbox.",
    agent: "A full web page: one HTML document with its own CSS and JavaScript, shown running in a sandbox. Use it for anything visual or interactive: mockups, prototypes, dashboards, reports, explainers. It must start with <!doctype html>. Read artifacts_formats_guide with kind \"html\" before writing one.",
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
    agent: "Mermaid diagram source that starts with its type, such as flowchart TD or sequenceDiagram. Use it for a diagram that stands alone; for a diagram inside a document, put a fenced code block with the language `mermaid` in the Markdown instead.",
  },
  ui: {
    label: "Interface",
    helper: "A rich page, such as a dashboard or report, built from our components.",
    agent: `An earlier format, kept for artifacts that already use it: a json-render spec on the artifacts.space component set. ${newVisualWork} Read artifacts_formats_guide with kind "ui" before changing one.`,
  },
  canvas: {
    label: "Canvas",
    helper: "A board of screens: mockups of websites and apps, built from our components.",
    agent: `An earlier format, kept for artifacts that already use it: a board of frames, each one screen that holds a json-render spec on the artifacts.space component set. No HTML or CSS. ${newVisualWork} Read artifacts_formats_guide with kind "canvas" before changing one.`,
  },
  file: {
    label: "Files",
    helper: "Images, PDFs, documents, video, and audio, with optional notes.",
    agent: "Uploaded files with optional Markdown notes as content. Create one with files_create_artifact after uploading (files_request_upload, PUT, files_finalize).",
  },
};
