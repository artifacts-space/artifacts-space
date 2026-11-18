// A relative path, and no `@/` import in this file: next.config.ts loads it, and its loader does not know the alias.
import { permissionsPolicy } from "../security-header-rules";

/*
 * The page host: where a page that an agent wrote runs. Such a page has
 * scripts, so it never runs on this site's own origin. Each artifact gets
 * its own host, `<label>.<PAGE_HOST>`, on a second domain that holds no
 * session. It serves one small frame document
 * (src/lib/page-host/frame-document.ts), at `/` and at every page address
 * of a site, and, under an address the site made for a viewer it checked,
 * that artifact's own page files (src/lib/page-files). It never serves a
 * document its author wrote. The site shows the frame document in a
 * sandboxed iframe and hands it the page's HTML with postMessage, so the
 * access check stays where it is today: whoever was given the content can
 * run it. Another page of the site (`about.html`) is a page file, which the
 * frame document fetches from its own address as text and writes in.
 *
 * Pure rules, safe for the proxy, the server, and the browser.
 */

/** A page host's first label: 32 lowercase hex characters, one per artifact. */
const labelPattern = /^[0-9a-f]{32}$/;

/**
 * The page host's domain, or null when pages cannot run here. `PAGE_HOST`
 * when set; `localhost` under `next dev`, where `<label>.localhost` reaches
 * the same server.
 */
export function pageHostBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const set = env.PAGE_HOST?.trim().toLowerCase();
  if (set) return /^[a-z0-9.-]+$/.test(set) ? set : null;
  return env.NODE_ENV === "development" ? "localhost" : null;
}

/** True for a host under the page domain (`www.<base>`, `<label>.<base>`, `a.b.<base>`); never for the domain itself. */
export function isUnderPageDomain(host: string | null, base: string | null): boolean {
  if (!base) return false;
  const name = hostName(host);
  return name.length > base.length + 1 && name.endsWith(`.${base}`);
}

/** The path every request to another host under the page domain is sent to; it answers 404 (src/app/page-host-refusal). */
export const pageHostRefusalPath = "/page-host-refusal";

/**
 * A pattern for one host name as a server may receive it: in any letter case. The pattern is matched as written,
 * with no flags, so each letter stands for both cases. A host name holds letters, digits, hyphens, and dots
 * (pageHostBase checks it); only the dot means something in a pattern.
 */
function hostPattern(name: string): string {
  return name.replace(/[a-z.]/g, (char) => (char === "." ? "\\." : `[${char}${char.toUpperCase()}]`));
}

/** One rewrite of the Next config: a path pattern, the hosts it holds for, and where it goes. */
export interface HostRewrite {
  source: string;
  has: { type: "host"; value: string }[];
  destination: string;
}

/**
 * Every path but a page file's (`/f/<token>/<path>`), which goes on to its
 * route (src/app/f): that route answers only on a page host, for a token
 * made for that host, and with the same 404 on every other host, so
 * leaving it out of the rewrite opens nothing on `www.<base>`.
 */
export const pageDomainRewriteSource = "/:path((?!f/[A-Za-z0-9_-]+/.).*)";

/**
 * The page domain serves frame documents and page files, and nothing else.
 * A wildcard domain sends every host under it to this app, so without this
 * rule `www.<base>` would show the whole site on the page domain, the same
 * site (to a browser) as pages that run anyone's scripts. This rewrite,
 * checked before any file or page, sends every path of every host under
 * the page domain to the refusal, but a page file's path
 * (pageDomainRewriteSource). A page host itself gets here only for a page
 * file: the proxy answers everything else first. Read when the app is built, so `PAGE_HOST` must be set
 * for the build as well as at run time. The domain itself is not covered:
 * never point it at this app. The pattern takes the host in any letter case
 * and with the dot a fully qualified name may end with, as isUnderPageDomain
 * does, so the two rules hold for the same hosts.
 */
export function pageDomainRewrites(env: NodeJS.ProcessEnv = process.env): HostRewrite[] {
  const base = pageHostBase(env);
  if (!base) return [];
  return [{ source: pageDomainRewriteSource, has: [{ type: "host", value: `.+\\.${hostPattern(base)}\\.?` }], destination: pageHostRefusalPath }];
}

/** The page itself under a files address: the frame document, so the page's files are its siblings and relative URLs reach them. */
export const pageDocumentName = "index.html";

/** `/f/<token>/<rest>`: the token's shape is openPageToken's (src/lib/page-files/token.ts); the rest is at least one character. */
const filesAddress = /^\/f\/[A-Za-z0-9_-]{60,400}\/(.+)$/;

/** A page's path in a site: at most eight parts of letters, digits, dots, dashes, and underscores, none starting with a dot, ending in `.html` in lowercase. */
const pageName = String.raw`(?:(?!\.)[A-Za-z0-9._-]+\/){0,7}(?!\.)[A-Za-z0-9._-]*[A-Za-z0-9_-]\.html`;

/**
 * The path of a page of a site, relative to its files address:
 * `index.html`, or the path an `.html` page file gives (`about.html`,
 * `docs/guide.html`). src/lib/page-files/rules.ts holds an HTML page file's
 * path to it, so every stored page has an address of this shape.
 */
export const pageNamePattern = new RegExp(`^${pageName}$`);

/** A page of a site under its files address, `/f/<token>/<page>`: the groups are the token and the page (pageNamePattern). */
export const pageAddressPattern = new RegExp(String.raw`^\/f\/([A-Za-z0-9_-]{60,400})\/(${pageName})$`);

/**
 * What a path on a page host is: the frame document, another page of the
 * site (the frame document to a browser that goes there, the page's source
 * to the frame document that asks for it), a page file (for the route to
 * answer), or nothing.
 */
export type PageHostPath = "frame" | "page" | "file" | "none";

/**
 * Reads a path on a page host. The frame document is at `/`, and at
 * `/f/<token>/index.html` for a page that has files. Another `.html` page
 * under `/f/<token>/` (pageAddressPattern) is a page of the site. Any other
 * path under `/f/<token>/` names a page file. The token is not checked here:
 * the frame document is the same for everyone, and the route checks a file's.
 */
export function pageHostPath(pathname: string): PageHostPath {
  if (pathname === "/") return "frame";
  const rest = filesAddress.exec(pathname)?.[1];
  if (rest === undefined) return "none";
  if (rest === pageDocumentName) return "frame";
  return pageAddressPattern.test(pathname) ? "page" : "file";
}

/** The path the frame loads: `/`, or the page's name under its files address when the page has files (`token` from the site). */
export function pageFramePath(token: string | null): string {
  return token === null ? "/" : `/f/${token}/${pageDocumentName}`;
}

/**
 * The header the frame document sets on its own fetch of a page's source
 * (frame-document.ts). A browser never sends it when it goes to an address,
 * and another site cannot send it here without a preflight, which a page
 * host refuses (405), so it tells the frame document's fetch from a
 * navigation. Answers that differ by it name it in `Vary`.
 */
export const pageSourceHeader = "X-Page-Source";

/**
 * Whether a request asks for a page's source (the frame document's own
 * fetch) rather than going to the page: it carries `X-Page-Source: 1`, and
 * whatever the browser says of it with `Sec-Fetch-Dest` and
 * `Sec-Fetch-Site`, when it says anything, is a same-origin fetch. Those two
 * can only take the answer away: older browsers send neither.
 */
export function isPageSourceRequest(headers: Pick<Headers, "get">): boolean {
  if (headers.get(pageSourceHeader) !== "1") return false;
  const destination = headers.get("sec-fetch-dest");
  const site = headers.get("sec-fetch-site");
  return (destination === null || destination === "empty") && (site === null || site === "same-origin");
}

/** A Host header without its port, in lower case, and without the dot a fully qualified name may end with. */
export function hostName(host: string | null): string {
  return ((host ?? "").split(":", 1)[0]?.toLowerCase() ?? "").replace(/\.$/, "");
}

/** The port of a Host header, or "" when it has none. */
export function hostPort(host: string | null): string {
  const port = (host ?? "").split(":")[1] ?? "";
  return /^\d{1,5}$/.test(port) ? port : "";
}

/** Whether a Host header looks like a page host of any domain: such a request never reaches the app. */
export function looksLikePageHost(host: string | null): boolean {
  const name = hostName(host);
  const dot = name.indexOf(".");
  return dot > 0 && labelPattern.test(name.slice(0, dot)) && name.length > dot + 1;
}

/** The label of a page host on this deployment's page domain, or null for any other host. */
export function pageLabelOf(host: string | null, base: string | null): string | null {
  if (!base) return null;
  const name = hostName(host);
  if (!name.endsWith(`.${base}`)) return null;
  const label = name.slice(0, name.length - base.length - 1);
  return labelPattern.test(label) ? label : null;
}

/**
 * The label for an artifact's page host: a hash of the artifact's public
 * id, which every reader of the artifact already holds. The host name says
 * nothing about the artifact: the public id is the key to a link-shared
 * artifact, and a 128-bit hash of it cannot be turned back into it. The
 * same artifact always gets the same host, so what its page stores in the
 * browser stays with it and out of every other artifact's reach.
 */
export async function pageLabelFor(pageKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`artifact-page:v1:${pageKey}`));
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Where the site is, as the browser's `location` says: the page host uses the same scheme and port. */
export interface SiteLocation {
  protocol: string;
  port: string;
}

/** The origin of an artifact's page host, as the site's page builds it for the iframe. */
export function pageOrigin(label: string, base: string, site: SiteLocation): string {
  return `${site.protocol}//${label}.${base}${site.port ? `:${site.port}` : ""}`;
}

/** Hosts a page may load scripts, styles, fonts, images, and data from: public package and font hosts, nothing else. */
export const pageScriptHosts = ["https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://esm.sh", "https://cdn.tailwindcss.com", "https://code.jquery.com"] as const;
const styleHosts = ["https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://unpkg.com"] as const;
const fontHosts = ["https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://unpkg.com"] as const;

/**
 * What a page may do, as a Content-Security-Policy on the frame document
 * (the page is written into that document, so the policy holds for it and a
 * page cannot loosen it). Inline scripts and styles run: that is the point.
 * Everything else is closed: no requests except to the public package and
 * font hosts and to the page's own host (`'self'`), where nothing answers
 * but the frame document and this artifact's own page files; no forms
 * posted anywhere; no frames inside it; and only this site may frame it,
 * so its address shows nothing in a tab of its own.
 *
 * What this does and does not promise: a page can reach no host its author
 * controls, so it cannot send what it knows to its author or track who
 * views it. It can still put data in the address of a request to one of
 * the listed hosts (an image, a fetch, a script), with no click. Only the
 * operator of that host could read it there. That is the price of loading
 * libraries and data from them; a host goes on the list only when its
 * operator shows a page's author nothing about single requests.
 */
export function pageContentPolicy(siteOrigin: string): string {
  const scripts = pageScriptHosts.join(" ");
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${scripts}`,
    `style-src 'self' 'unsafe-inline' ${styleHosts.join(" ")}`,
    `font-src 'self' data: ${fontHosts.join(" ")}`,
    `img-src 'self' data: blob: ${scripts}`,
    "media-src 'self' data: blob:",
    `connect-src 'self' ${scripts}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${siteOrigin}`,
  ].join("; ");
}

/**
 * The iframe's sandbox. Scripts run, and the page keeps its own origin (its
 * own host), so browser storage works and stays with the artifact. It
 * cannot navigate the tab it is shown in, and it cannot start a download:
 * a file with a name the page chose, saved from under this site's header,
 * would read as this site's. Links may open a new tab. That tab keeps this
 * sandbox (there is no `allow-popups-to-escape-sandbox`), so the page
 * cannot use a tab it opened to do what it may not do here; the other site
 * in it still runs its scripts and forms, but cannot start a download.
 */
export const pageSandbox = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups";

/** Where on a page host the frame document answers: `/`, `index.html` under a files address, or another page's address there. */
export type FramePlace = "root" | "index" | "page";

/**
 * How long, and by whom, the frame document may be kept. At `/` any cache
 * may keep it for an hour: it is the same for everyone. Under a files
 * address the address holds a short-lived token made for one reader, so
 * only the reader's own browser may keep it (`private`), and a shared cache
 * never stores it: at another page's address the same address answers the
 * frame document's fetch with the page's source, and a shared cache that
 * ignored `Vary` could give one answer for the other. `no-store` under
 * `next dev`.
 */
function frameCacheControl(cache: boolean, place: FramePlace): string {
  if (!cache) return "no-store";
  return place === "root" ? "public, max-age=3600" : "private, max-age=3600";
}

/**
 * Headers of the frame document. No session exists on the page host, so the
 * response is the same for everyone. At another page's address (`page`) the
 * same address answers the frame document's fetch with the page's source,
 * so the answer names the header that tells the two apart (`Vary`) for the
 * browser's own cache, and no shared cache keeps it (frameCacheControl).
 */
export function pageHostHeaders(siteOrigin: string, cache: boolean, place: FramePlace = "root"): Record<string, string> {
  return {
    ...(place === "page" ? { Vary: pageSourceHeader } : {}),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": pageContentPolicy(siteOrigin),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": permissionsPolicy,
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": frameCacheControl(cache, place),
  };
}

/** Headers of every other answer on a page host: nothing is there. */
export const pageHostRefusalHeaders: Record<string, string> = {
  "Content-Type": "text/plain; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
};

/** Messages between the site's page and the frame document. */
export const pageMessages = {
  /** Frame document to site: loaded at `/` or at `index.html`, and waiting for the page. */
  ready: "artifact-page:ready",
  /**
   * Frame document to site: loaded at another page of the site's files
   * (`about.html`), which it loads from its own address. The site answers
   * with `renew` and the newest files address, so the page's source is asked
   * for, and its own relative requests go, under an address that still works.
   */
  opened: "artifact-page:opened",
  /** Site to frame document: the page's HTML. */
  render: "artifact-page:render",
  /** Frame document to site: the page was written. */
  shown: "artifact-page:shown",
  /** Site to frame: is a document of the page host still in the frame? Carries a fresh `id`. */
  ping: "artifact-page:ping",
  /** Frame to site: yes. It repeats the question's `id` and carries nothing else. */
  pong: "artifact-page:pong",
  /**
   * Site to frame document: the page's files have a new address. Carries
   * `path`, the frame document's path under it (pageFramePath). The frame
   * document takes only the token from it and moves its own address to the
   * same page, query, and hash under that token, without loading anything,
   * so what the page asks for by relative path from then on uses the new
   * address.
   */
  renew: "artifact-page:renew",
} as const;

/**
 * How long the site waits for an answer after the frame loaded something.
 * No answer means the frame holds a document of another origin (the page
 * navigated its frame to another address), and the site closes it. Long
 * enough for a heavy page that keeps its thread busy while it starts.
 *
 * The time runs from the first load that is still unanswered, not from the
 * latest one: a frame that keeps loading documents of another origin must
 * not push its own deadline back each time. An answer ends the wait, and
 * the next load starts a new one.
 */
export const PAGE_ANSWER_MS = 8000;
