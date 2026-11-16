import { permissionsPolicy } from "@/lib/security-header-rules";

/*
 * The page host: where a page that an agent wrote runs. Such a page has
 * scripts, so it never runs on this site's own origin. Each artifact gets
 * its own host, `<label>.<PAGE_HOST>`, on a second domain that holds no
 * session and serves nothing but one small frame document
 * (src/lib/page-host/frame-document.ts). The site shows that document in a
 * sandboxed iframe and hands it the page's HTML with postMessage, so the
 * access check stays where it is today: whoever was given the content can
 * run it, and the page host itself reads nothing.
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

/** A Host header without its port, in lower case. */
export function hostName(host: string | null): string {
  return (host ?? "").split(":", 1)[0]?.toLowerCase() ?? "";
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
 * The label for an artifact's page host: a hash of its id, so the host name
 * says nothing about the artifact (not its id, and never its public id,
 * which is the key to a link-shared artifact). The same artifact always gets
 * the same host, so what its page stores in the browser stays with it and
 * out of every other artifact's reach.
 */
export async function pageLabelFor(artifactId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`artifact-page:v1:${artifactId}`));
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
 * font hosts; no forms posted anywhere; no frames inside it; and only this
 * site may frame it, so its address shows nothing in a tab of its own.
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
    `script-src 'unsafe-inline' 'unsafe-eval' blob: ${scripts}`,
    `style-src 'unsafe-inline' ${styleHosts.join(" ")}`,
    `font-src data: ${fontHosts.join(" ")}`,
    `img-src data: blob: ${scripts}`,
    "media-src data: blob:",
    `connect-src ${scripts}`,
    "worker-src blob:",
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

/** Headers of the frame document. No session exists on the page host, so the response is the same for everyone. */
export function pageHostHeaders(siteOrigin: string, cache: boolean): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": pageContentPolicy(siteOrigin),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": permissionsPolicy,
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": cache ? "public, max-age=3600" : "no-store",
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
  /** Frame document to site: loaded, and waiting for the page. */
  ready: "artifact-page:ready",
  /** Site to frame document: the page's HTML. */
  render: "artifact-page:render",
  /** Frame document to site: the page was written. */
  shown: "artifact-page:shown",
  /** Site to frame: is a document of the page host still in the frame? Carries a fresh `id`. */
  ping: "artifact-page:ping",
  /** Frame to site: yes. It repeats the question's `id` and carries nothing else. */
  pong: "artifact-page:pong",
} as const;

/**
 * How long the site waits for an answer after the frame loaded something.
 * No answer means the frame holds a document of another origin (the page
 * navigated its frame to another address), and the site closes it. Long
 * enough for a heavy page that keeps its thread busy while it starts.
 */
export const PAGE_ANSWER_MS = 8000;
