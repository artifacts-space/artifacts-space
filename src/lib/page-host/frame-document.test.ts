import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { frameDocument, frameScript } from "./frame-document";
import { pageMessages } from "./rules";

/*
 * The frame document's script, run as a browser would run it, against a
 * stand-in window: what it does with each message depends only on who sent
 * it (the window that frames it, from the site's origin) and what it holds.
 */

const site = "https://artifacts.test";
const pageOrigin = "https://0123456789abcdef0123456789abcdef.pages.test";
const token = (letter: string) => letter.repeat(120);
const framePath = (letter: string) => `/f/${token(letter)}/index.html`;

interface Message {
  origin: string;
  source: unknown;
  data: unknown;
}

/** A frame document loaded at `pathname`, framed by `host`. */
function loadFrame(pathname: string) {
  const listeners = new Set<(event: Message) => void>();
  const posted: { message: { type?: string; id?: string }; target: string }[] = [];
  const moves: string[] = [];
  const written: string[] = [];
  const host = { postMessage: (message: { type?: string }, target: string) => { posted.push({ message, target }); } };
  const location = { pathname, search: "", hash: "" };
  const frame = {
    parent: host,
    addEventListener: (_type: string, listener: (event: Message) => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: (event: Message) => void) => { listeners.delete(listener); },
  };
  const document = {
    // As in a browser: document.open() drops every listener on the window.
    open: () => { listeners.clear(); },
    write: (html: string) => { written.push(html); },
    close: () => undefined,
  };
  const history = {
    state: null,
    replaceState: (_state: unknown, _title: string, path: string) => {
      moves.push(path);
      location.pathname = path;
    },
  };
  runInNewContext(frameScript(site), { window: frame, document, history, location, RegExp, JSON });
  const deliver = (message: Message) => { for (const listener of [...listeners]) listener(message); };
  return { frame, host, posted, moves, written, location, deliver, fromSite: (data: unknown) => { deliver({ origin: site, source: host, data }); } };
}

describe("the frame document's renewal", () => {
  it("should move its own address to the new files address when the site, in the framing window, sends it", () => {
    const loaded = loadFrame(framePath("A"));
    loaded.fromSite({ type: pageMessages.renew, path: framePath("B") });
    expect(loaded.moves).toEqual([framePath("B")]);
    expect(loaded.location.pathname).toBe(framePath("B"));
  });

  it("should renew nothing for a message from the page itself", () => {
    const loaded = loadFrame(framePath("A"));
    // The page shares the frame document's window and origin: its own postMessage arrives so.
    loaded.deliver({ origin: pageOrigin, source: loaded.frame, data: { type: pageMessages.renew, path: framePath("B") } });
    // The page claiming the site's origin still is not the framing window.
    loaded.deliver({ origin: site, source: loaded.frame, data: { type: pageMessages.renew, path: framePath("B") } });
    expect(loaded.moves).toEqual([]);
  });

  it("should renew nothing for a message from another origin, or from another window", () => {
    const loaded = loadFrame(framePath("A"));
    const other = { postMessage: () => undefined };
    loaded.deliver({ origin: "https://evil.test", source: loaded.host, data: { type: pageMessages.renew, path: framePath("B") } });
    loaded.deliver({ origin: pageOrigin, source: loaded.host, data: { type: pageMessages.renew, path: framePath("B") } });
    loaded.deliver({ origin: site, source: other, data: { type: pageMessages.renew, path: framePath("B") } });
    loaded.deliver({ origin: "null", source: null, data: { type: pageMessages.renew, path: framePath("B") } });
    expect(loaded.moves).toEqual([]);
  });

  it("should move only to a frame document's path under a files address", () => {
    const loaded = loadFrame(framePath("A"));
    for (const path of ["/", "/elsewhere", `/f/${token("B")}/data.json`, `/f/${token("B")}/index.html?x=1`, `https://evil.test${framePath("B")}`, `//evil.test${framePath("B")}`, `/f/short/index.html`, `${framePath("B")}/../x`, 7, null, undefined]) {
      loaded.fromSite({ type: pageMessages.renew, path });
    }
    loaded.fromSite({ type: "artifact-page:other", path: framePath("B") });
    loaded.fromSite(null);
    expect(loaded.moves).toEqual([]);
  });

  it("should not move a frame document that has no files address", () => {
    const loaded = loadFrame("/");
    loaded.fromSite({ type: pageMessages.renew, path: framePath("B") });
    expect(loaded.moves).toEqual([]);
  });

  it("should still renew, and still answer the site, after the page was written into the document", () => {
    const loaded = loadFrame(framePath("A"));
    loaded.fromSite({ type: pageMessages.render, html: "<!doctype html><p>Page</p>" });
    expect(loaded.written).toEqual(["<!doctype html><p>Page</p>"]);
    loaded.fromSite({ type: pageMessages.renew, path: framePath("B") });
    loaded.fromSite({ type: pageMessages.renew, path: framePath("C") });
    expect(loaded.moves).toEqual([framePath("B"), framePath("C")]);
    loaded.fromSite({ type: pageMessages.ping, id: "question-1" });
    expect(loaded.posted.at(-1)).toEqual({ message: { type: pageMessages.pong, id: "question-1" }, target: site });
    // The page is written once: a second render is not taken.
    loaded.fromSite({ type: pageMessages.render, html: "<p>Again</p>" });
    expect(loaded.written).toHaveLength(1);
    // And the page's own message still renews nothing.
    loaded.deliver({ origin: pageOrigin, source: loaded.frame, data: { type: pageMessages.renew, path: framePath("D") } });
    expect(loaded.moves).toHaveLength(2);
  });

  it("should keep running when the browser refuses the move", () => {
    const listeners: ((event: Message) => void)[] = [];
    const host = { postMessage: () => undefined };
    runInNewContext(frameScript(site), {
      window: { parent: host, addEventListener: (_type: string, listener: (event: Message) => void) => { listeners.push(listener); }, removeEventListener: () => undefined },
      document: {},
      history: { state: null, replaceState: () => { throw new Error("SecurityError"); } },
      location: { pathname: framePath("A") },
      RegExp,
      JSON,
    });
    expect(listeners.length).toBeGreaterThan(0);
    expect(() => { for (const listener of listeners) listener({ origin: site, source: host, data: { type: pageMessages.renew, path: framePath("B") } }); }).not.toThrow();
  });
});

describe("the frame document", () => {
  it("should say it is ready to the site only, and do nothing in a tab of its own", () => {
    const loaded = loadFrame("/");
    expect(loaded.posted).toEqual([{ message: { type: pageMessages.ready }, target: site }]);

    const added: string[] = [];
    const alone: { parent?: unknown; addEventListener: (type: string) => void } = { addEventListener: (type) => { added.push(type); } };
    alone.parent = alone;
    runInNewContext(frameScript(site), { window: alone, document: {}, history: {}, location: { pathname: "/" }, RegExp, JSON });
    expect(added).toEqual([]);
  });

  it("should hold no markup of its own in the script", () => {
    expect(frameScript(site)).not.toContain("<");
    // Not even for an origin that could never be one: whatever is written in is escaped.
    expect(frameScript("https://a.test</script><script>alert(1)")).not.toContain("<");
  });

  it("should be one document whose only script is the one these tests run", () => {
    const html = frameDocument(site);
    const opening = "<script>";
    const closing = "</script>";
    expect(html.split(opening)).toHaveLength(2);
    expect(html.split(closing)).toHaveLength(2);
    expect(html.slice(html.indexOf(opening) + opening.length, html.indexOf(closing))).toBe(frameScript(site));
  });
});
