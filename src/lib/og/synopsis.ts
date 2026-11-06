import type { ArtifactKind } from "@/lib/artifact-types";
import { parseCsv } from "@/lib/csv";

import type { Synopsis } from "./synopsis-types";
import { uiSynopsis } from "./synopsis-ui";
import { plainMarkdown, squash, truncate } from "./text-utils";

/*
 * Builds the picture on an artifact's social preview card from its approved
 * content. Pure and defensive: content comes from agents, so nothing here
 * throws, and nothing is drawn from user SVG, images, or URLs.
 */

export interface SynopsisInput {
  kind: ArtifactKind;
  content: string;
  language: string;
  /** Files attached to a file artifact, in order. Empty for other kinds. */
  files: readonly { filename: string; contentType: string }[];
}

/** The short label for each kind, shown above the title. */
export const ogKindLabels: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  code: "Code",
  text: "Text",
  json: "JSON",
  csv: "CSV",
  svg: "SVG image",
  mermaid: "Diagram",
  ui: "Dashboard",
  file: "Files",
};

const codeLines = 8;
const codeColumns = 40;
const proseChars = 300;

const mermaidTypes: Record<string, string> = {
  flowchart: "Flowchart",
  graph: "Flowchart",
  sequencediagram: "Sequence diagram",
  classdiagram: "Class diagram",
  statediagram: "State diagram",
  "statediagram-v2": "State diagram",
  erdiagram: "Entity relationships",
  gantt: "Gantt chart",
  pie: "Pie chart",
  mindmap: "Mind map",
  timeline: "Timeline",
  journey: "User journey",
  gitgraph: "Git graph",
  quadrantchart: "Quadrant chart",
};

function proseSynopsis(content: string, markdown: boolean): Synopsis {
  if (!markdown) return { type: "prose", heading: null, body: truncate(squash(content), proseChars) };
  const { heading, lines } = plainMarkdown(content, 6);
  return { type: "prose", heading: heading ? truncate(heading, 80) : null, body: truncate(lines.join(" "), proseChars) };
}

function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function codeSynopsis(content: string, language: string): Synopsis {
  const lines = content.replace(/\t/g, "  ").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() !== "");
  const shown = (start === -1 ? [] : lines.slice(start, start + codeLines)).map((line) => truncate(line.trimEnd(), codeColumns));
  return { type: "code", language: truncate(language, 20), lines: shown };
}

function csvSynopsis(content: string): Synopsis {
  const parsed = parseCsv(content, { maxRows: 4 });
  const header = parsed.header.slice(0, 4).map((cell) => truncate(squash(cell), 14));
  if (header.length === 0) return { type: "glyph", glyph: "page", label: "CSV", detail: null };
  const rows = parsed.rows.map((row) => header.map((_, index) => truncate(squash(row[index] ?? ""), 14)));
  return { type: "table", header, rows };
}

function mermaidSynopsis(content: string): Synopsis {
  const first = content.split(/\r?\n/).find((line) => line.trim() !== "" && !line.trim().startsWith("%%")) ?? "";
  const word = first.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return { type: "glyph", glyph: "diagram", label: "Diagram", detail: mermaidTypes[word] ?? null };
}

const mediaFamilies = new Set(["image", "video", "audio"]);

function fileExtension(filename: string): string {
  return /\.([a-z0-9]{1,8})$/i.exec(filename)?.[1]?.toUpperCase() ?? "";
}

/** A short file type name: "PDF", "PNG image", or the extension. */
export function fileTypeLabel(file: { filename: string; contentType: string }): string {
  const [family = "", subtype = ""] = file.contentType.toLowerCase().split("/");
  if (subtype === "pdf") return "PDF";
  const name = fileExtension(file.filename) || subtype.toUpperCase().slice(0, 8);
  if (mediaFamilies.has(family)) return `${name} ${family}`.trim();
  return name || "File";
}

function fileSynopsis(files: SynopsisInput["files"]): Synopsis {
  const first = files[0];
  if (!first) return { type: "glyph", glyph: "file", label: "Files", detail: null };
  const more = files.length > 1 ? ` · ${String(files.length)} files` : "";
  return { type: "glyph", glyph: "file", label: truncate(first.filename, 30), detail: `${fileTypeLabel(first)}${more}` };
}

const builders: Record<ArtifactKind, (input: SynopsisInput) => Synopsis> = {
  ui: ({ content }) => uiSynopsis(content) ?? { type: "glyph", glyph: "page", label: "Dashboard", detail: null },
  markdown: ({ content }) => proseSynopsis(content, true),
  text: ({ content }) => proseSynopsis(content, false),
  csv: ({ content }) => csvSynopsis(content),
  code: ({ content, language }) => codeSynopsis(content, language || "Code"),
  json: ({ content }) => codeSynopsis(prettyJson(content), "JSON"),
  mermaid: ({ content }) => mermaidSynopsis(content),
  svg: () => ({ type: "glyph", glyph: "vector", label: "Vector image", detail: null }),
  file: ({ files }) => fileSynopsis(files),
};

/** The synopsis for one artifact version. */
export function buildSynopsis(input: SynopsisInput): Synopsis {
  return builders[input.kind](input);
}
