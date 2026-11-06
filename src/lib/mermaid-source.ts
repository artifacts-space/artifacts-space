/** Largest Mermaid source we accept, in characters. */
export const maxMermaidLength = 50_000;

/** Diagram types Mermaid understands, by their first keyword. */
const diagramKeywords = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "classDiagram-v2",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
  "mindmap",
  "timeline",
  "zenuml",
  "sankey-beta",
  "sankey",
  "xychart-beta",
  "xychart",
  "block-beta",
  "block",
  "packet-beta",
  "packet",
  "kanban",
  "architecture-beta",
  "radar-beta",
  "treemap-beta",
];

const keywordSet = new Set(diagramKeywords);

/** Removes a leading `---` front-matter block. */
function stripFrontMatter(lines: string[]): string[] {
  if (lines[0]?.trim() !== "---") return lines;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return end === -1 ? [] : lines.slice(end + 1);
}

/** The diagram keyword on the first meaningful line, or null. */
export function mermaidDiagramType(source: string): string | null {
  const lines = stripFrontMatter(source.replace(/^﻿/, "").split(/\r?\n/));
  const first = lines.map((line) => line.trim()).find((line) => line !== "" && !line.startsWith("%%"));
  if (!first) return null;
  const keyword = first.split(/[\s;:{]/)[0] ?? "";
  return keywordSet.has(keyword) ? keyword : null;
}

/**
 * Checks Mermaid source without running Mermaid: size, and a known diagram
 * keyword first. Mermaid itself reports finer syntax errors when it renders.
 * Returns an error message, or null when the source looks right.
 */
export function checkMermaidSource(source: string): string | null {
  if (source.length > maxMermaidLength) {
    return `The diagram is ${source.length.toLocaleString("en-US")} characters; the limit is ${maxMermaidLength.toLocaleString("en-US")}.`;
  }
  if (mermaidDiagramType(source)) return null;
  return "Mermaid source must start with a diagram type such as flowchart TD, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, or mindmap.";
}
