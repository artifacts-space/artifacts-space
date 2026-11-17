import { pageFramePathPattern, pageMessages } from "./rules";

/**
 * The one document a page host serves: a script that waits for the page's
 * HTML from the site that frames it, and writes it in place. It takes a
 * message only from the window that frames it, and only when that window is
 * the site (`siteOrigin`); in a tab of its own it does nothing. It writes
 * once: a new version is shown by loading this document again.
 *
 * It also answers the site's question "is a document of the page host still
 * in the frame?" by repeating the question's id. The page it writes shares
 * this window and this origin, so nothing here is a secret from the page,
 * and the page could answer as well: that is fine, because the question is
 * about the origin. What gives the answer its meaning is on the site's
 * side: it accepts an answer only from the frame's window, only from the
 * page host's origin, and only with the id of a question it just asked, so
 * a document of another origin can never answer, and an answer sent ahead
 * of the question does not count (page-frame.tsx).
 *
 * A page with page files runs under an address that ends after some
 * minutes (src/lib/page-files/token.ts). Before it does, the site sends
 * the next one ("renew"), and this moves the document's own address to it
 * with history.replaceState: nothing loads, the page keeps running, and
 * what it asks for by relative path from then on goes to the new address.
 * It takes that message, like every other, only from the window that
 * frames it and only from the site's origin, and only for a path that is
 * the frame document's own under a files address: so the page itself,
 * another frame, or another site can never move it. The page shares this
 * window and could move its own address anyway; that gives it nothing, as
 * a files address serves only that page's own files.
 */
export function frameDocument(siteOrigin: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title></head><body><script>${frameScript(siteOrigin)}</script></body></html>`;
}

/**
 * The frame document's one script, as it stands between its script tags.
 * It holds no "<": the site's origin is the only value written into it,
 * and every "<" is written as an escape, so nothing in it can end the
 * script element or start markup.
 */
export function frameScript(siteOrigin: string): string {
  const script = `(function () {
  var site = ${JSON.stringify(siteOrigin)};
  var host = window.parent;
  if (!host || host === window) return;
  function onPing(event) {
    if (event.origin !== site || event.source !== host) return;
    if (event.data && event.data.type === ${JSON.stringify(pageMessages.ping)}) host.postMessage({ type: ${JSON.stringify(pageMessages.pong)}, id: event.data.id }, site);
  }
  var framePath = new RegExp(${JSON.stringify(pageFramePathPattern.source)});
  function onRenew(event) {
    if (event.origin !== site || event.source !== host) return;
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(pageMessages.renew)} || typeof data.path !== "string") return;
    // Only from one files address to the next: a frame document at "/" has no files address to renew.
    if (!framePath.test(data.path) || !framePath.test(location.pathname)) return;
    try { history.replaceState(history.state, "", data.path); } catch (error) { /* The page keeps the address it has. */ }
  }
  function onMessage(event) {
    if (event.origin !== site || event.source !== host) return;
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(pageMessages.render)} || typeof data.html !== "string") return;
    window.removeEventListener("message", onMessage);
    document.open();
    // document.open() drops every listener on the window, so these are added after it, and before any script of the page runs.
    window.addEventListener("message", onPing);
    window.addEventListener("message", onRenew);
    document.write(data.html);
    document.close();
    host.postMessage({ type: ${JSON.stringify(pageMessages.shown)} }, site);
  }
  // Answers from the start, so the site can tell this document from another origin's before the page is written.
  window.addEventListener("message", onPing);
  window.addEventListener("message", onRenew);
  window.addEventListener("message", onMessage);
  host.postMessage({ type: ${JSON.stringify(pageMessages.ready)} }, site);
})();`;
  return script.replaceAll("<", "\\u003c");
}
