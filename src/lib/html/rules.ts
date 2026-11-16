import type { ArtifactKind, ArtifactVisibility } from "@/lib/artifact-types";
import { isReportable } from "@/lib/reports/rules";

/*
 * The HTML format: one full HTML document with its own styles and scripts,
 * shown running in a sandbox on a page host (src/lib/page-host/rules.ts).
 * These rules read the source as text. Nothing here parses or sanitizes it:
 * the sandbox, not this check, is what keeps a page in.
 */

const doctype = /^<!doctype html\b[^>]*>/i;

/** The source without a byte order mark and leading white space. */
function start(content: string): string {
  return content.replace(/^﻿/, "").trimStart();
}

/**
 * Why HTML content cannot be saved, or null when it can. It must start
 * with `<!doctype html>`, so every page draws in the browser's standards
 * mode and a fragment or another language is not saved as a page by
 * mistake.
 */
export function htmlProblem(content: string): string | null {
  if (doctype.test(start(content))) return null;
  return "An HTML artifact is a full page: it must start with <!doctype html>, followed by <html>, <head>, and <body>.";
}

/** Whether text reads as a full HTML page, for a pasted or uploaded file. */
export function looksLikeHtmlPage(content: string): boolean {
  return htmlProblem(content) === null;
}

const namedEntities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return namedEntities[name.toLowerCase()] ?? whole;
  });
}

/** How much of the source the text readers scan: a link preview needs a few hundred characters, never a megabyte. */
const scanChars = 60_000;

/**
 * The words a reader would see on the page, roughly: the source without
 * scripts, styles, comments, and tags, on one line. For a link preview's
 * excerpt and for search, never for display as HTML.
 */
export function htmlText(content: string): string {
  const source = content.slice(0, scanChars);
  const body = source.replace(/^[\s\S]*?<body\b[^>]*>/i, "");
  const text = body
    .replace(/<!--[\s\S]*?(--!?>|$)/g, " ")
    .replace(/<(script|style|template|noscript|svg|head)\b[\s\S]*?(<\/\1\b[^>]*>|$)/gi, " ")
    .replace(/<[^>]*(>|$)/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

/**
 * Whether a reader sees the note that an HTML page is its author's, not
 * this site's: on a page shared by link or with everyone, for a reader who
 * cannot edit it. The author and the team know whose page it is.
 */
export function showsAuthorNote(view: { kind: ArtifactKind; canEdit: boolean; visibility: ArtifactVisibility }): boolean {
  return view.kind === "html" && !view.canEdit && isReportable(view.visibility);
}

/** The page's own <title>, or "" when it has none. */
export function htmlTitle(content: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(content.slice(0, scanChars));
  return match ? decodeEntities(match[1] ?? "").replace(/\s+/g, " ").trim() : "";
}

/** What a new HTML artifact starts with in the editor: a small, complete page. */
export const htmlStarter = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New page</title>
  <style>
    body { margin: 0; padding: 2rem; font: 16px/1.5 system-ui, sans-serif; }
  </style>
</head>
<body>
  <h1>New page</h1>
  <p>Write your page here.</p>
</body>
</html>
`;
