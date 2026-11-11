import type { ArtifactKind } from "@/lib/artifact-types";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import { checkMermaidSource, mermaidDiagramType } from "@/lib/mermaid-source";
import { checkSvg } from "@/lib/svg";
import { validateUiSpec } from "@/lib/ui/validate";

/**
 * Which format the first content of a new artifact has, decided from clear
 * signals only. Anything unclear stays Markdown, so a wrong guess is rare and
 * costs one click. The content itself is never rewritten, with one exception:
 * a paste that is one whole fenced code block becomes Code without its two
 * fence lines, since a code view would show them as code.
 */

/** Why a format was chosen, for tests and for the chip that names it. */
export type DetectReason = "empty" | "prose" | "heading" | "svg" | "json" | "ui" | "fence" | "shebang" | "mermaid" | "csv" | "extension";

export interface Detection {
  kind: ArtifactKind;
  /** The code language from the fence, the extension, or the shebang; "" otherwise. */
  language: string;
  /** The content to keep: what was pasted (only a whole fence loses its two fence lines). */
  content: string;
  /** A title the content names: its first line as a `# Heading`, or a file's name. Null otherwise. */
  title: string | null;
  reason: DetectReason;
}

const markdown = (content: string, reason: DetectReason, title: string | null = null): Detection => ({ kind: "markdown", language: "", content, title, reason });

/** Prologue parts that may come before an SVG root, with what ends each one. */
const prologueParts: readonly (readonly [string, string])[] = [["<?xml", "?>"], ["<!--", "-->"], ["<!doctype", ">"]];
const svgRoot = /^<svg[\s>/]/i;
const space = /\s/;

/**
 * Where the content starts after a byte order mark, whitespace, an XML
 * declaration, comments, and a doctype. A plain scan with indexOf, so it runs
 * in linear time on any input, where a regex with repeated lazy groups can
 * backtrack without end.
 */
export function afterPrologue(text: string): number {
  let index = text.startsWith("﻿") ? 1 : 0;
  for (;;) {
    while (index < text.length && space.test(text.charAt(index))) index += 1;
    const rest = text.slice(index, index + 9).toLowerCase();
    const part = prologueParts.find(([open]) => rest.startsWith(open));
    if (!part) return index;
    const end = text.indexOf(part[1], index + part[0].length);
    if (end === -1) return index;
    index = end + part[1].length;
  }
}

function detectSvg(text: string): Detection | null {
  const start = afterPrologue(text);
  if (!svgRoot.test(text.slice(start, start + 5))) return null;
  return checkSvg(text).ok ? { kind: "svg", language: "", content: text, title: null, reason: "svg" } : null;
}

function detectJson(text: string): Detection | null {
  const first = text.trimStart()[0];
  if (first !== "{" && first !== "[") return null;
  try {
    JSON.parse(text);
  } catch {
    return null;
  }
  if (first === "{" && validateUiSpec(text).valid) return { kind: "ui", language: "", content: text, title: null, reason: "ui" };
  return { kind: "json", language: "", content: text, title: null, reason: "json" };
}

/** An opening fence with a language label, such as ```ts or ~~~python. Anchored and without nested quantifiers, so it is linear. */
const openingFence = /^(`{3,}|~{3,})[ \t]*([\w#+.-]+)/;

/** The first and last lines with text, or null when there are fewer than two. */
function outerLines(lines: readonly string[]): { first: number; last: number } | null {
  const first = lines.findIndex((line) => line.trim() !== "");
  let last = lines.length - 1;
  while (last > first && lines[last]?.trim() === "") last -= 1;
  return first === -1 || last <= first ? null : { first, last };
}

/** The fence lines and the lines between them, when the whole paste is one fenced block; null otherwise. */
function wholeFence(text: string): { fence: string; label: string; body: string } | null {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const outer = outerLines(lines);
  if (!outer) return null;
  const [opening = "", closing = ""] = [lines[outer.first], lines[outer.last]];
  const [, fence = "", label = ""] = openingFence.exec(opening.trimStart()) ?? [];
  if (fence === "" || closing.trim() !== fence) return null;
  const inner = lines.slice(outer.first + 1, outer.last);
  // A fence of the same kind inside means a document with several blocks, not one.
  if (inner.some((line) => line.trimStart().startsWith(fence))) return null;
  return { fence, label, body: inner.join("\n") };
}

function detectFence(text: string): Detection | null {
  const found = wholeFence(text);
  if (!found) return null;
  const { label, body } = found;
  if (label.toLowerCase() === "mermaid" && checkMermaidSource(body) === null && mermaidDiagramType(body)) {
    return { kind: "mermaid", language: "", content: body, title: null, reason: "fence" };
  }
  return { kind: "code", language: label, content: body, title: null, reason: "fence" };
}

/** Interpreters a shebang names, as the language label to store. Anything else keeps the interpreter's own name. */
const shebangLanguages: Readonly<Record<string, string>> = {
  sh: "bash", bash: "bash", zsh: "zsh", dash: "bash", ksh: "bash", fish: "fish",
  python: "python", node: "javascript", deno: "typescript", bun: "typescript", "ts-node": "typescript", tsx: "typescript",
  ruby: "ruby", perl: "perl", php: "php", lua: "lua", rscript: "r",
};

function shebangLanguage(line: string): string | null {
  const words = line.slice(2).trim().split(/\s+/).filter((word) => !word.startsWith("-"));
  const program = words[0]?.split("/").pop() ?? "";
  const interpreter = program === "env" ? (words[1] ?? "") : program;
  const name = interpreter.toLowerCase().replace(/[\d.]+$/, "");
  if (!name) return null;
  return shebangLanguages[name] ?? name;
}

/** A shebang names a path (`#!/usr/bin/env node`) or a known interpreter (`#!python3`); "#!important note" does neither. */
function isShebang(line: string): boolean {
  if (line.startsWith("#!/")) return true;
  const name = (line.slice(2).trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[\d.]+$/, "");
  return line.startsWith("#!") && Object.hasOwn(shebangLanguages, name);
}

function detectShebang(text: string): Detection | null {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (!isShebang(firstLine)) return null;
  const language = shebangLanguage(firstLine);
  return language ? { kind: "code", language, content: text, title: null, reason: "shebang" } : null;
}

/** Keywords that are also everyday words: their first line must be only a diagram header. */
const wordKeywords = new Set(["graph", "pie", "journey", "timeline", "block", "packet", "kanban", "mindmap", "gantt", "sankey", "treemap-beta", "radar-beta"]);
const directions = new Set(["TB", "TD", "BT", "RL", "LR"]);

/** True when the first line is a bare diagram header such as `flowchart TD`, `pie title Pets`, or `sequenceDiagram`. */
function isDiagramHeader(line: string, keyword: string): boolean {
  const rest = line.trim().slice(keyword.length).trim().replace(/;$/, "");
  if (rest === "") return true;
  if (keyword === "graph" || keyword === "flowchart") return directions.has(rest);
  if (keyword === "pie") return /^(?:showData\b|title\s)/.test(rest);
  if (wordKeywords.has(keyword)) return false;
  // Camel-case keywords (sequenceDiagram, erDiagram, …) never start a sentence; allow what follows.
  return true;
}

/** A diagram line's sub-keyword, label, or node shape. */
const diagramSyntax = /^\s*(?:title|section|dateFormat|axisFormat|excludes|todayMarker|x-axis|y-axis|accTitle|accDescr)\b|:\s*\S|[[\](){}|]/;
/** Mermaid's arrows and links, matched as plain text. */
const diagramArrows = ["-->", "---", "==>", "-.->"] as const;

/** True for a line of diagram source: a sub-keyword, an arrow or link, a label, or a node shape. Prose lines have none of these. */
function isDiagramLine(line: string): boolean {
  return diagramSyntax.test(line) || diagramArrows.some((arrow) => line.includes(arrow));
}

/**
 * True when the lines under the header read as a diagram. A keyword that is
 * also a word ("timeline", "journey") alone on the first line could start a
 * note, so every line under it must be diagram source.
 */
function hasDiagramBody(header: string, keyword: string, body: readonly string[]): boolean {
  const bare = header.trim().slice(keyword.length).trim().replace(/;$/, "") === "";
  if (!wordKeywords.has(keyword) || !bare) return body.length > 0;
  return body.length > 0 && body.every(isDiagramLine);
}

function detectMermaid(text: string): Detection | null {
  const keyword = mermaidDiagramType(text);
  if (!keyword || checkMermaidSource(text) !== null) return null;
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.trim().startsWith("%%"));
  const at = lines.findIndex((line) => line.trim().startsWith(keyword));
  const header = lines[at];
  if (!header || !isDiagramHeader(header, keyword) || !hasDiagramBody(header, keyword, lines.slice(at + 1))) return null;
  return { kind: "mermaid", language: "", content: text, title: null, reason: "mermaid" };
}

/** Line starts that mark a Markdown document, so a list with commas is not read as a table. */
const markdownLine = /^\s*(?:[-*+]\s|#{1,6}\s|>|\d+[.)]\s|\|)/;
/** A record that ends like a sentence. Tables rarely do; prose with commas does. */
const sentenceEnd = /[.!?:]["')\]]?$/;

/** True when every record has the same number of fields and none reads as a sentence. */
function isTabular(rows: readonly (readonly string[])[], columns: number): boolean {
  return rows.every((row) => {
    const last = row[row.length - 1]?.trim() ?? "";
    return row.length === columns && !sentenceEnd.test(last);
  });
}

/** Share of fields after the first in each record that start with a space: prose and lists write "a, b"; files write "a,b". */
function spacedShare(records: readonly (readonly string[])[]): number {
  const later = records.flatMap((record) => record.slice(1));
  return later.length === 0 ? 0 : later.filter((field) => /^\s/.test(field)).length / later.length;
}

/** True when some field is a phrase of several words. */
function hasPhrases(records: readonly (readonly string[])[]): boolean {
  return records.some((record) => record.some((field) => /\S\s+\S/.test(field.trim())));
}

/**
 * True when the records read as data rather than writing. Tabs are data
 * (spreadsheets paste them). With commas or semicolons, "a, b" spacing is
 * how sentences and lists are written, so it needs at least three records
 * of single words; unspaced fields need three records, or no phrases.
 */
function looksLikeData(delimiter: string, records: readonly (readonly string[])[]): boolean {
  if (delimiter === "\t") return true;
  const phrases = hasPhrases(records);
  if (spacedShare(records) > 0.5) return records.length >= 3 && !phrases;
  return records.length >= 3 || !phrases;
}

function detectCsv(text: string): Detection | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2 || lines.some((line) => markdownLine.test(line))) return null;
  const delimiter = detectDelimiter(text);
  const parsed = parseCsv(text, { delimiter, maxRows: 0 });
  if (parsed.errors.length > 0 || parsed.header.length < 2 || parsed.totalRows < 1) return null;
  const all = parseCsv(text, { delimiter, maxRows: Math.min(parsed.totalRows, 1000) });
  if (all.header.some((field) => field.trim() === "")) return null;
  const records = [all.header, ...all.rows];
  if (!isTabular(records, all.header.length) || !looksLikeData(delimiter, records)) return null;
  return { kind: "csv", language: "", content: text, title: null, reason: "csv" };
}

/** The title a first line `# Heading` names, or null. Only a top-level heading counts. */
export function headingTitle(text: string): string | null {
  const firstLine = text.slice(afterBom(text)).trimStart().split(/\r?\n/, 1)[0] ?? "";
  if (!/^#[ \t]/.test(firstLine)) return null;
  // Closing hashes (`# Plan ##`) are not part of the heading.
  const title = firstLine.slice(1).trim().replace(/[ \t]#+$/, "").replace(/^#+$/, "").trim();
  return title === "" ? null : title.slice(0, 160);
}

/** 1 when the text starts with a byte order mark, else 0. */
function afterBom(text: string): number {
  return text.startsWith("\uFEFF") ? 1 : 0;
}

/** Detectors in order: the most specific signals first. CSV is last, since shape is the weakest signal. */
const detectors: readonly ((text: string) => Detection | null)[] = [detectSvg, detectFence, detectJson, detectShebang, detectMermaid, detectCsv];

/**
 * The format of text pasted or dropped into an empty new artifact. Plain
 * writing stays Markdown; a first line `# Heading` also names the title.
 */
export function detectTextKind(text: string): Detection {
  if (text.trim() === "") return markdown(text, "empty");
  for (const detect of detectors) {
    const found = detect(text);
    if (found) return found;
  }
  const title = headingTitle(text);
  return markdown(text, title ? "heading" : "prose", title);
}

/** Extensions of formats read as text when dropped, since they are not uploaded as files. */
const textFormatExtensions: Readonly<Record<string, ArtifactKind>> = { svg: "svg", mmd: "mermaid", mermaid: "mermaid" };

/** Source code extensions, with the language label to store when it differs from the extension. */
const codeExtensions: Readonly<Record<string, string>> = {
  ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", cs: "csharp", php: "php",
  sh: "bash", bash: "bash", zsh: "zsh", fish: "fish", ps1: "powershell", sql: "sql",
  html: "html", htm: "html", css: "css", scss: "scss", less: "less", vue: "vue", svelte: "svelte",
  yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini", xml: "xml", lua: "lua", r: "r", dart: "dart", scala: "scala",
  ex: "elixir", exs: "elixir", erl: "erlang", hs: "haskell", clj: "clojure", ml: "ocaml", pl: "perl",
  graphql: "graphql", gql: "graphql", proto: "proto", tf: "terraform", nix: "nix", zig: "zig", sol: "solidity",
};

/** Whole file names that are code without an extension. */
const codeFileNames: Readonly<Record<string, string>> = { dockerfile: "dockerfile", makefile: "makefile", gemfile: "ruby", rakefile: "ruby" };

/** A file's name without its last extension, as a title. */
export function fileTitle(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return (stem.trim() || base.trim() || "Untitled").slice(0, 160);
}

/** How a dropped or pasted file becomes content: read as text into a format, or uploaded as a file. */
export type FilePlan = { read: true; kind: ArtifactKind; language: string } | { read: false };

/** The plan for one file by its name: code and text formats that cannot be uploaded are read; everything else is uploaded. */
export function filePlan(name: string): FilePlan {
  const base = (name.split(/[\\/]/).pop() ?? name).toLowerCase();
  const byName = codeFileNames[base];
  if (byName) return { read: true, kind: "code", language: byName };
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 ? base.slice(dot + 1) : "";
  const textKind = textFormatExtensions[extension];
  if (textKind) return { read: true, kind: textKind, language: "" };
  const language = codeExtensions[extension];
  if (language) return { read: true, kind: "code", language };
  return { read: false };
}

/**
 * The format of a dropped or pasted file's text, read because of its
 * extension. A text format that does not pass its checks (an SVG that never
 * closes) becomes Code labelled with the extension, so nothing is lost.
 */
export function detectFileText(name: string, text: string, plan: Extract<FilePlan, { read: true }>): Detection {
  const title = fileTitle(name);
  if (plan.kind === "svg" && !checkSvg(text).ok) return { kind: "code", language: "xml", content: text, title, reason: "extension" };
  if (plan.kind === "mermaid" && checkMermaidSource(text) !== null) return { kind: "code", language: "mermaid", content: text, title, reason: "extension" };
  return { kind: plan.kind, language: plan.language, content: text, title, reason: "extension" };
}
