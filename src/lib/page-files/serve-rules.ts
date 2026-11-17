import { pageContentPolicy } from "@/lib/page-host/rules";
import { permissionsPolicy } from "@/lib/security-header-rules";

import { servedContentType } from "./rules";

/*
 * How a page file is answered on a page host: the headers, the Range a
 * player may ask for, and the stand-in artifact of the development fixture.
 * Pure rules; serve.ts does the lookups.
 */

/**
 * The artifact id of the development fixture's page (/dev/page-frame?page=files).
 * No stored artifact has it. Under `next dev` only, a token for it is served
 * from files held in memory (fixture-source.ts), so the whole path (proxy,
 * token, route, headers, frame) is tested without a database or storage.
 */
export const fixturePageArtifactId = "fixture:page-files";

/** One `bytes=` range with at least one end, as a player sends it. Anything else is not passed on, and the whole file is served. */
const rangePattern = /^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/;

/** The Range header to pass on to storage, or null to serve the whole file. */
export function passedRange(range: string | null): string | null {
  const value = range?.trim() ?? "";
  return rangePattern.test(value) ? value : null;
}

/** A page file as it is served: where its bytes are, and what it is. */
export interface ServedPageFile {
  key: string;
  contentType: string;
  size: number;
}

/** What the answer's body is: the whole file or a part, and how long. */
export interface ServedBody {
  status: 200 | 206;
  length: number;
  contentRange: string | null;
}

/** Whole seconds a browser may keep a page file: until its address ends, and never past it. */
export function pageFileMaxAge(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

/**
 * The Content-Security-Policy of a page file's answer: the page's own
 * policy, plus `sandbox`. A browser applies a file's policy only when the
 * file is opened as a document of its own (an SVG, or any file in a tab or
 * a frame), and there `sandbox` gives it no scripts and no origin: a page
 * host address never shows a document its author wrote outside the site's
 * frame, where the frame document, and nothing else, starts the page. A
 * file the page loads (a stylesheet, a script, a picture, a fetch) is not
 * touched by it. A worker started from a page file takes the page's policy
 * from here, so it reaches what the page may reach and no more.
 */
export function pageFilePolicy(site: string): string {
  return `${pageContentPolicy(site)}; sandbox`;
}

/**
 * Headers of a page file's answer. It is served with the type its path
 * gave it and may not be sniffed as another, under pageFilePolicy. Only
 * the page's own origin may load it (Cross-Origin-Resource-Policy), and
 * only the viewer's browser may keep it, for no longer than its address
 * works.
 */
export function pageFileHeaders(input: { site: string; contentType: string; body: ServedBody; expiresAt: Date; now: Date }): Record<string, string> {
  return {
    "Content-Type": servedContentType(input.contentType),
    "Content-Length": String(input.body.length),
    ...(input.body.contentRange ? { "Content-Range": input.body.contentRange } : {}),
    "Accept-Ranges": "bytes",
    "Content-Security-Policy": pageFilePolicy(input.site),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": permissionsPolicy,
    "X-Robots-Tag": "noindex, nofollow",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": `private, max-age=${String(pageFileMaxAge(input.expiresAt, input.now))}`,
  };
}
