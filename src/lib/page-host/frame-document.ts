import { pageMessages } from "./rules";

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
 */
export function frameDocument(siteOrigin: string): string {
  const script = `(function () {
  var site = ${JSON.stringify(siteOrigin)};
  var host = window.parent;
  if (!host || host === window) return;
  function onPing(event) {
    if (event.origin !== site || event.source !== host) return;
    if (event.data && event.data.type === ${JSON.stringify(pageMessages.ping)}) host.postMessage({ type: ${JSON.stringify(pageMessages.pong)}, id: event.data.id }, site);
  }
  function onMessage(event) {
    if (event.origin !== site || event.source !== host) return;
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(pageMessages.render)} || typeof data.html !== "string") return;
    window.removeEventListener("message", onMessage);
    document.open();
    // document.open() drops every listener on the window, so this one is added after it, and before any script of the page runs.
    window.addEventListener("message", onPing);
    document.write(data.html);
    document.close();
    host.postMessage({ type: ${JSON.stringify(pageMessages.shown)} }, site);
  }
  window.addEventListener("message", onMessage);
  host.postMessage({ type: ${JSON.stringify(pageMessages.ready)} }, site);
})();`;
  // "<" never appears in the script as markup: the origin is the only value in it, and JSON.stringify of an origin has none.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title></head><body><script>${script.replaceAll("<", "\\u003c")}</script></body></html>`;
}
