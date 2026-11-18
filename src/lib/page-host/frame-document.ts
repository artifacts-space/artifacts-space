import { pageAddressPattern, pageDocumentName, pageMessages, pageSourceHeader } from "./rules";

/**
 * The one document a page host serves: a script that waits for the page's
 * HTML from the site that frames it, and writes it in place. It takes a
 * message only from the window that frames it, and only when that window is
 * the site (`siteOrigin`); in a tab of its own it does nothing. It writes
 * once: a new version is shown by loading this document again.
 *
 * At the address of another page of the site (`/f/<token>/about.html`,
 * where a link of the page went) it is the same document: it says so to the
 * site ("opened"), takes the newest files address the site answers with
 * ("renew"), fetches its own address with the source header
 * (`X-Page-Source: 1`), which the page host answers with that page file as
 * plain text, and writes it in with the same steps; an answer of any other
 * type is never written. When there is no such file (a 404) it shows a
 * line of its own instead: "This page has no file at <path>", the path set
 * as text, and a link to the first page; any other failure says the page
 * could not be loaded, with the same link. The page is never served to
 * the browser as a document: only this
 * script reads it.
 *
 * It also answers the site's question "is a document of the page host still
 * in the frame?" by repeating the question's id, from the start, at every
 * address. The page it writes shares this window and this origin, so
 * nothing here is a secret from the page, and the page could answer as
 * well: that is fine, because the question is about the origin. What gives
 * the answer its meaning is on the site's side: it accepts an answer only
 * from the frame's window, only from the page host's origin, and only with
 * the id of a question it just asked, so a document of another origin can
 * never answer, and an answer sent ahead of the question does not count
 * (page-frame.tsx).
 *
 * A page with page files runs under an address that ends after some
 * minutes (src/lib/page-files/token.ts). Before it does, the site sends
 * the next one ("renew"), and this moves the document's own address to it
 * with history.replaceState, keeping its own page, query, and hash and
 * changing only the token: nothing loads, the page keeps running, and what
 * it asks for by relative path from then on goes to the new address. It
 * takes that message, like every other, only from the window that frames it
 * and only from the site's origin, and only when both the message's path
 * and its own are a page's under a files address (pageAddressPattern): so
 * the page itself, another frame, or another site can never move it. The
 * page shares this window and could move its own address anyway; that gives
 * it nothing, as a files address serves only that page's own files.
 */
export function frameDocument(siteOrigin: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title></head><body><script>${frameScript(siteOrigin)}</script></body></html>`;
}

/**
 * The frame document's one script, as it stands between its script tags.
 * It holds no "<": the site's origin is the only value written into it,
 * and every "<" is written as an escape, so nothing in it can end the
 * script element or start markup. It writes no markup of its own: the
 * missing-page line is built from elements and text.
 */
export function frameScript(siteOrigin: string): string {
  const type = (name: keyof typeof pageMessages) => JSON.stringify(pageMessages[name]);
  const script = `(function () {
  var site = ${JSON.stringify(siteOrigin)};
  var host = window.parent;
  if (!host || host === window) return;
  var pageAddress = new RegExp(${JSON.stringify(pageAddressPattern.source)});
  var own = pageAddress.exec(location.pathname);
  // Another page of the site: written from its own address once the site sent the newest one. Null at "/" and at index.html.
  var page = own && own[2] !== ${JSON.stringify(pageDocumentName)} ? own[2] : null;
  // True until the first renewal: that one asks for this page's source, and every later one only moves the address.
  var notYetAsked = page !== null;
  function onPing(event) {
    if (event.origin !== site || event.source !== host) return;
    if (event.data && event.data.type === ${type("ping")}) host.postMessage({ type: ${type("pong")}, id: event.data.id }, site);
  }
  function onRenew(event) {
    if (event.origin !== site || event.source !== host) return;
    var data = event.data;
    if (!data || data.type !== ${type("renew")} || typeof data.path !== "string") return;
    // Only from one files address to the next: a frame document at "/" has no files address to renew. Only the token changes.
    var next = pageAddress.exec(data.path);
    var here = pageAddress.exec(location.pathname);
    if (!next || !here) return;
    try { history.replaceState(history.state, "", "/f/" + next[1] + "/" + here[2] + location.search + location.hash); } catch (error) { /* The page keeps the address it has. */ }
    if (notYetAsked) {
      notYetAsked = false;
      load();
    }
  }
  function write(html) {
    document.open();
    // document.open() drops every listener on the window, so these are added after it, and before any script of the page runs.
    window.addEventListener("message", onPing);
    window.addEventListener("message", onRenew);
    document.write(html);
    document.close();
    host.postMessage({ type: ${type("shown")} }, site);
  }
  // A 404 is a page with no file there (or an address that ended); anything else, a failed fetch included, is a page that could not load.
  function missing(status) {
    var note = document.createElement("p");
    note.textContent = status === 404 ? "This page has no file at " + page + "." : "This page could not be loaded: " + page + ". Load it again.";
    var link = document.createElement("a");
    link.href = "../".repeat(page.split("/").length - 1) + ${JSON.stringify(pageDocumentName)};
    link.textContent = "Go to the first page";
    var back = document.createElement("p");
    back.appendChild(link);
    document.title = "No such page";
    document.body.appendChild(note);
    document.body.appendChild(back);
    host.postMessage({ type: ${type("shown")} }, site);
  }
  // Only the page host's answer for a page's source is written: plain text. Anything else, the frame document itself from a cache included, is no page.
  function isSource(response) {
    return response.ok && (response.headers.get("content-type") || "").indexOf("text/plain") === 0;
  }
  function load() {
    fetch(location.pathname, { headers: { ${JSON.stringify(pageSourceHeader)}: "1" }, credentials: "same-origin", redirect: "error" })
      .then(function (response) { return isSource(response) ? response.text().then(write) : missing(response.status); })
      .then(null, function () { missing(0); });
  }
  function onMessage(event) {
    if (event.origin !== site || event.source !== host) return;
    var data = event.data;
    if (!data || data.type !== ${type("render")} || typeof data.html !== "string") return;
    window.removeEventListener("message", onMessage);
    write(data.html);
  }
  // Answers from the start, so the site can tell this document from another origin's before the page is written.
  window.addEventListener("message", onPing);
  window.addEventListener("message", onRenew);
  if (page !== null) {
    host.postMessage({ type: ${type("opened")} }, site);
    return;
  }
  window.addEventListener("message", onMessage);
  host.postMessage({ type: ${type("ready")} }, site);
})();`;
  return script.replaceAll("<", "\\u003c");
}
