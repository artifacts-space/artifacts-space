import { pageMessages } from "./rules";

/**
 * The one document a page host serves: a script that waits for the page's
 * HTML from the site that frames it, and writes it in place. It takes a
 * message only from the window that frames it, and only when that window is
 * the site (`siteOrigin`); in a tab of its own it does nothing. It writes
 * once: a new version is shown by loading this document again.
 *
 * With the page comes a word (`nonce`) that only this script keeps, in a
 * variable the page's scripts cannot reach. When the site asks, this script
 * answers with the word. That is how the site knows the frame still holds
 * this document and the page it wrote: a page that sent its frame to
 * another address cannot answer. Everything else the frame posts is the
 * page's word, not this document's.
 */
export function frameDocument(siteOrigin: string): string {
  const script = `(function () {
  var site = ${JSON.stringify(siteOrigin)};
  var host = window.parent;
  if (!host || host === window) return;
  var word = null;
  function onPing(event) {
    if (event.origin !== site || event.source !== host) return;
    if (event.data && event.data.type === ${JSON.stringify(pageMessages.ping)}) host.postMessage({ type: ${JSON.stringify(pageMessages.pong)}, nonce: word }, site);
  }
  function onMessage(event) {
    if (event.origin !== site || event.source !== host) return;
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(pageMessages.render)} || typeof data.html !== "string") return;
    word = typeof data.nonce === "string" ? data.nonce : null;
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
