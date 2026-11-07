import type { ArtifactKind } from "@/lib/artifact-types";
import { parseCsv } from "@/lib/csv";
import { uiSpecToMarkdown } from "@/lib/markdown/ui-spec";
import { OG_WORDMARK } from "@/lib/site-copy";
import { validateUiSpec } from "@/lib/ui/validate";

import { buildSynopsis, ogKindLabels } from "./synopsis";
import { plainMarkdown, squash } from "./text-utils";

/*
 * The plain-text description of a shared artifact, for <meta name="description">,
 * og:description, and twitter:description. Callers pass only the approved
 * version of a link or public artifact (see artifactOgMetadata), so the text
 * is always something a signed-out reader could already see. Pure and
 * defensive: content comes from agents, so nothing here throws.
 */

/** Longest description, in characters. Search results and link previews cut around here. */
export const DESCRIPTION_MAX = 160;

/** Most characters read from the start of prose before it is cut, so a huge artifact costs no more than a small one. */
const proseScan = 20_000;
/** Body lines read from Markdown: plenty to fill one description. */
const proseLines = 12;
/** A cut at a word boundary may give back at most this share of the text; past that, cut mid-word. */
const minKeptShare = 0.6;
const trailingPunctuation = /[\s,;:.\-–—([{]+$/u;

export interface DescriptionInput {
  kind: ArtifactKind;
  summary: string;
  content: string;
  language: string;
  /** Files attached to a file artifact, in order. Empty for other kinds. */
  files: readonly { filename: string }[];
}

/**
 * `text` on one line, cut to at most `max` characters at a word boundary,
 * ending in an ellipsis when cut. A single long word is cut mid-word.
 */
export function clipAtWord(text: string, max = DESCRIPTION_MAX): string {
  const plain = squash(text);
  const chars = Array.from(plain);
  if (chars.length <= max) return plain;
  const head = chars.slice(0, Math.max(0, max - 1)).join("");
  const space = head.lastIndexOf(" ");
  const cut = space >= head.length * minKeptShare ? head.slice(0, space) : head;
  return `${cut.replace(trailingPunctuation, "")}…`;
}

function markdownExcerpt(markdown: string): string {
  const { heading, lines } = plainMarkdown(markdown.slice(0, proseScan), proseLines);
  return lines.length > 0 ? lines.join(" ") : (heading ?? "");
}

function uiExcerpt(content: string): string {
  if (!validateUiSpec(content).renderable) return "";
  return markdownExcerpt(uiSpecToMarkdown(content));
}

const hasWord = /[\p{L}\p{N}]/u;

function codeExcerpt(content: string, language: string): string {
  const label = language.trim() ? `${squash(language)} code` : ogKindLabels.code;
  const line = content
    .slice(0, proseScan)
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => hasWord.test(candidate) && !candidate.startsWith("#!"));
  return line ? `${label} · ${line}` : "";
}

function jsonExcerpt(content: string): string {
  try {
    const value: unknown = JSON.parse(content);
    if (Array.isArray(value)) return `JSON list · ${String(value.length)} ${value.length === 1 ? "item" : "items"}`;
    if (value === null || typeof value !== "object") return "";
    const keys = Object.keys(value);
    return keys.length > 0 ? `JSON · keys ${keys.join(", ")}` : "";
  } catch {
    return "";
  }
}

function csvExcerpt(content: string): string {
  const parsed = parseCsv(content, { maxRows: 1 });
  const columns = parsed.header.map(squash).filter((name) => name !== "");
  if (columns.length === 0) return "";
  const rows = `${parsed.totalRows.toLocaleString("en-US")} ${parsed.totalRows === 1 ? "row" : "rows"}`;
  return `Table · ${rows} · columns ${columns.join(", ")}`;
}

function mermaidExcerpt(content: string): string {
  const synopsis = buildSynopsis({ kind: "mermaid", content, language: "", files: [] });
  return synopsis.type === "glyph" && synopsis.detail ? `${ogKindLabels.mermaid} · ${synopsis.detail}` : "";
}

function fileExcerpt(notes: string, files: DescriptionInput["files"]): string {
  const fromNotes = markdownExcerpt(notes);
  if (fromNotes) return fromNotes;
  if (files.length === 0) return "";
  const count = `${String(files.length)} ${files.length === 1 ? "file" : "files"}`;
  return `${count}: ${files.map((file) => file.filename).join(", ")}`;
}

const excerpts: Record<ArtifactKind, (input: DescriptionInput) => string> = {
  markdown: ({ content }) => markdownExcerpt(content),
  text: ({ content }) => content.slice(0, proseScan),
  ui: ({ content }) => uiExcerpt(content),
  code: ({ content, language }) => codeExcerpt(content, language),
  json: ({ content }) => jsonExcerpt(content),
  csv: ({ content }) => csvExcerpt(content),
  mermaid: ({ content }) => mermaidExcerpt(content),
  svg: () => "",
  file: ({ content, files }) => fileExcerpt(content, files),
};

/**
 * The description of one approved artifact version: its summary, else a
 * plain-text excerpt of its content by kind, else "<Kind> on artifacts.space".
 * At most DESCRIPTION_MAX characters, on one line.
 */
export function artifactDescription(input: DescriptionInput): string {
  const summary = clipAtWord(input.summary);
  if (summary) return summary;
  const excerpt = clipAtWord(excerpts[input.kind](input));
  if (excerpt) return excerpt;
  return `${ogKindLabels[input.kind]} on ${OG_WORDMARK}`;
}
