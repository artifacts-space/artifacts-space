import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { frameScript } from "./frame-document";
import { pageMessages, pageSourceHeader } from "./rules";

/*
 * The frame document at another page of a site (`/f/<token>/about.html`,
 * where a link of the page went), run as a browser would run it, against a
 * stand-in window: it fetches its own address's source only once the site
 * sent the newest files address, writes it as it writes the first page, and
 * builds its missing-page line from text alone.
 */

const site = "https://artifacts.test";
const pageOrigin = "https://0123456789abcdef0123456789abcdef.pages.test";
const token = (letter: string) => letter.repeat(120);
const pageAt = (letter: string, page: string) => `/f/${token(letter)}/${page}`;

interface Message {
  origin: string;
  source: unknown;
  data: unknown;
}

/** An element as the stand-in document makes it: what the script set on it. */
interface Element {
  tag: string;
  textContent: string;
  href: string;
  children: Element[];
  appendChild: (child: Element) => void;
}

function element(tag: string): Element {
  const made: Element = { tag, textContent: "", href: "", children: [], appendChild: (child) => { made.children.push(child); } };
  return made;
}

/** What the stand-in fetch answers: a status and a body, or a failure on the way. */
type Answer = { status: number; body: string } | "fails";

interface Asked {
  url: string;
  init: { headers?: Record<string, string>; credentials?: string; redirect?: string };
}

/** A frame document loaded at `pathname` (with its query and hash), framed by the site unless `alone`. */
function loadPage(pathname: string, options: { answer?: Answer; alone?: boolean; search?: string; hash?: string } = {}) {
  const listeners = new Set<(event: Message) => void>();
  const posted: { type?: string }[] = [];
  const moves: string[] = [];
  const written: string[] = [];
  const asked: Asked[] = [];
  const host = { postMessage: (message: { type?: string }) => { posted.push(message); } };
  const location = { pathname, search: options.search ?? "", hash: options.hash ?? "" };
  const frame: { parent?: unknown; addEventListener: (type: string, listener: (event: Message) => void) => void; removeEventListener: (type: string, listener: (event: Message) => void) => void } = {
    addEventListener: (_type, listener) => { listeners.add(listener); },
    removeEventListener: (_type, listener) => { listeners.delete(listener); },
  };
  frame.parent = options.alone ? frame : host;
  const body = element("body");
  const document = {
    title: "Page",
    body,
    createElement: element,
    // As in a browser: document.open() drops every listener on the window.
    open: () => { listeners.clear(); },
    write: (html: string) => { written.push(html); },
    close: () => undefined,
  };
  const history = { state: null, replaceState: (_state: unknown, _title: string, path: string) => { moves.push(path); location.pathname = path.replace(/[?#].*$/, ""); } };
  const answer = options.answer ?? { status: 200, body: "<!doctype html><p>About</p>" };
  const fetch = (url: string, init: Asked["init"]) => {
    asked.push({ url, init });
    if (answer === "fails") return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ ok: answer.status >= 200 && answer.status <= 299, text: () => Promise.resolve(answer.body) });
  };
  runInNewContext(frameScript(site), { window: frame, document, history, location, fetch, RegExp, JSON });
  const deliver = (message: Message) => { for (const listener of [...listeners]) listener(message); };
  return { frame, host, posted, moves, written, asked, body, document, listeners, deliver, fromSite: (data: unknown) => { deliver({ origin: site, source: host, data }); } };
}

/** Lets the stand-in fetch's promises settle. */
const settled = () => new Promise<void>((resolve) => { setImmediate(resolve); });

describe("the frame document at another page of the site", () => {
  it("should tell the site it opened another page, and fetch nothing until the site sends the newest address", async () => {
    const loaded = loadPage(pageAt("A", "about.html"));
    expect(loaded.posted).toEqual([{ type: pageMessages.opened }]);
    await settled();
    expect(loaded.asked).toEqual([]);
    expect(loaded.written).toEqual([]);
  });

  it("should move to the newest token, keep its own page, query, and hash, and fetch its own source with the header", async () => {
    const loaded = loadPage(pageAt("A", "docs/guide.html"), { search: "?tab=2", hash: "#top" });
    loaded.fromSite({ type: pageMessages.renew, path: pageAt("B", "index.html") });
    expect(loaded.moves).toEqual([`${pageAt("B", "docs/guide.html")}?tab=2#top`]);
    expect(loaded.asked).toEqual([{ url: pageAt("B", "docs/guide.html"), init: { headers: { [pageSourceHeader]: "1" }, credentials: "same-origin", redirect: "error" } }]);
    await settled();
    expect(loaded.written).toEqual(["<!doctype html><p>About</p>"]);
    expect(loaded.posted.at(-1)).toEqual({ type: pageMessages.shown });
  });

  it("should still answer the site and take renewals after the page was written, and fetch once only", async () => {
    const loaded = loadPage(pageAt("A", "about.html"));
    loaded.fromSite({ type: pageMessages.renew, path: pageAt("A", "index.html") });
    await settled();
    loaded.fromSite({ type: pageMessages.renew, path: pageAt("C", "index.html") });
    expect(loaded.moves.at(-1)).toBe(pageAt("C", "about.html"));
    expect(loaded.asked).toHaveLength(1);
    loaded.fromSite({ type: pageMessages.ping, id: "question-2" });
    expect(loaded.posted.at(-1)).toEqual({ type: pageMessages.pong, id: "question-2" });
  });

  it("should never write the HTML the site sends for the first page", async () => {
    const loaded = loadPage(pageAt("A", "about.html"));
    loaded.fromSite({ type: pageMessages.render, html: "<!doctype html><p>First page</p>" });
    await settled();
    expect(loaded.written).toEqual([]);
  });

  it.each([
    ["a page that has no file there", { status: 404, body: "Not found" }],
    ["a fetch that fails on the way", "fails"],
  ] as const)("should show its own line, built from text, for %s", async (_name, answer) => {
    const loaded = loadPage(pageAt("A", "docs/missing.html"), { answer });
    loaded.fromSite({ type: pageMessages.renew, path: pageAt("A", "index.html") });
    await settled();
    expect(loaded.written).toEqual([]);
    const [note, back] = loaded.body.children;
    expect(note).toMatchObject({ tag: "p", textContent: "This page has no file at docs/missing.html." });
    expect(back?.children[0]).toMatchObject({ tag: "a", href: "../index.html", textContent: "Go to the first page" });
    expect(loaded.posted.at(-1)).toEqual({ type: pageMessages.shown });
  });

  it("should take nothing from the address or a message into markup: the line names only the path, as text", async () => {
    // A query and a hash are the page's own; a renewal's path gives only its token.
    const loaded = loadPage(pageAt("A", "missing.html"), { answer: { status: 404, body: "" }, search: "?x=<b>bold</b>", hash: "#<img src=x onerror=alert(1)>" });
    loaded.fromSite({ type: pageMessages.renew, path: pageAt("B", "index.html") });
    await settled();
    expect(loaded.written).toEqual([]);
    expect(loaded.body.children.map((child) => child.textContent)).toEqual(["This page has no file at missing.html.", ""]);
    expect(loaded.body.children[1]?.children[0]?.href).toBe("index.html");
  });

  it("should do nothing in a tab of its own: no message, no listener, no fetch", async () => {
    const loaded = loadPage(pageAt("A", "about.html"), { alone: true });
    await settled();
    expect(loaded.posted).toEqual([]);
    expect(loaded.listeners.size).toBe(0);
    expect(loaded.asked).toEqual([]);
  });

  it("should take the address from nobody but the site in the framing window, and only a files address of a page", async () => {
    const loaded = loadPage(pageAt("A", "about.html"));
    const other = { postMessage: () => undefined };
    const renew = { type: pageMessages.renew, path: pageAt("B", "index.html") };
    loaded.deliver({ origin: pageOrigin, source: loaded.frame, data: renew });
    loaded.deliver({ origin: site, source: loaded.frame, data: renew });
    loaded.deliver({ origin: "https://evil.test", source: loaded.host, data: renew });
    loaded.deliver({ origin: site, source: other, data: renew });
    for (const path of ["/", "/elsewhere.html", pageAt("B", "data.json"), `${pageAt("B", "index.html")}?x=1`, `https://evil.test${pageAt("B", "index.html")}`, `//evil.test${pageAt("B", "index.html")}`, "/f/short/about.html", pageAt("B", "../about.html"), 7, null]) {
      loaded.fromSite({ type: pageMessages.renew, path });
    }
    await settled();
    expect(loaded.moves).toEqual([]);
    expect(loaded.asked).toEqual([]);
  });

  it("should behave as the first page at index.html and at the root: ready, and no fetch", async () => {
    for (const pathname of [pageAt("A", "index.html"), "/"]) {
      const loaded = loadPage(pathname);
      await settled();
      expect(loaded.posted).toEqual([{ type: pageMessages.ready }]);
      expect(loaded.asked).toEqual([]);
    }
  });

  it("should keep the first page's own query and hash when its address is renewed", () => {
    const loaded = loadPage(pageAt("A", "index.html"), { search: "?tab=2", hash: "#top" });
    loaded.fromSite({ type: pageMessages.renew, path: pageAt("B", "index.html") });
    expect(loaded.moves).toEqual([`${pageAt("B", "index.html")}?tab=2#top`]);
  });
});
