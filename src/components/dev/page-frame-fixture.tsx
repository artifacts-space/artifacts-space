"use client";

import { useState } from "react";

import { PageFrame } from "@/components/artifact-view/page-frame";

/*
 * Development only: HTML pages for e2e/page-frame.spec.ts. Each page
 * reports what it could and could not do as text, so the test reads the
 * sandbox from inside.
 */

const report = `
  function say(id, text) { document.getElementById(id).textContent = text; }
  function attempt(id, run) {
    try { Promise.resolve(run()).then(function (value) { say(id, String(value)); }, function (error) { say(id, "refused: " + error.name); }); }
    catch (error) { say(id, "refused: " + error.name); }
  }
`;

const pages = {
  /** A page that runs a script and tries each way out of the sandbox. */
  probe: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Probe</title><style>body { font: 16px system-ui; margin: 24px; } dt { font-weight: 600; }</style></head>
<body>
<h1 id="ran">Script did not run</h1>
<dl>
  <dt>origin</dt><dd id="origin"></dd>
  <dt>site document</dt><dd id="parent"></dd>
  <dt>storage</dt><dd id="storage"></dd>
  <dt>request to the site</dt><dd id="site-fetch"></dd>
  <dt>request elsewhere</dt><dd id="other-fetch"></dd>
  <dt>leave the tab</dt><dd id="top"></dd>
  <dt>inner frame</dt><dd id="frame"></dd>
</dl>
<script>${report}
  say("ran", "Script ran");
  say("origin", location.origin);
  attempt("parent", function () { return parent.document.title; });
  attempt("storage", function () { localStorage.setItem("probe", "kept"); return localStorage.getItem("probe"); });
  attempt("site-fetch", function () { return fetch(location.ancestorOrigins[0] + "/dev/page-frame", { mode: "no-cors" }).then(function () { return "sent"; }); });
  attempt("other-fetch", function () { return fetch("https://example.com/", { mode: "no-cors" }).then(function () { return "sent"; }); });
  attempt("top", function () { top.location.href = "https://example.com/"; return "left"; });
  document.addEventListener("securitypolicyviolation", function (event) { if (event.violatedDirective.indexOf("frame-src") === 0) say("frame", "refused: " + event.violatedDirective); });
  var inner = document.createElement("iframe"); inner.src = "https://example.com/"; document.body.appendChild(inner);
</script>
</body>
</html>`,
  /** A page that sends its own frame to another address soon after it starts. */
  leave: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Leave</title></head><body><p id="text">Leaving.</p><script>setTimeout(function () { location.href = "/elsewhere"; }, 300);</script></body></html>`,
  /** A page that reloads itself once. */
  reload: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reload</title></head><body><p id="text">Not reloaded yet.</p><script>if (sessionStorage.getItem("reloaded")) { document.getElementById("text").textContent = "Reloaded once."; } else { sessionStorage.setItem("reloaded", "1"); setTimeout(function () { location.reload(); }, 300); }</script></body></html>`,
  /** A plain page with no colors of its own. */
  plain: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plain</title></head><body><p id="text">Plain page.</p></body></html>`,
} as const;

type PageName = keyof typeof pages;

function isPageName(value: string): value is PageName {
  return Object.hasOwn(pages, value);
}

/** One page in a frame (`page`: probe, leave, reload, or plain), with a button that swaps it for a second version. */
export function PageFrameFixture({ page }: { page: string }) {
  const name = isPageName(page) ? page : "probe";
  const [version, setVersion] = useState(1);
  const html = version === 1 ? pages[name] : pages[name].replace("</body>", `<p id="version">Version ${String(version)}</p></body>`);
  return (
    <main className="mx-auto flex h-dvh max-w-4xl flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Page frame fixture</h1>
      <button type="button" className="self-start rounded-md border px-3 py-1 text-sm" onClick={() => { setVersion((current) => current + 1); }}>Save a new version</button>
      <PageFrame pageKey={`fixture-page-${name}`} html={html} title="Fixture page" className="flex-1 rounded-md border" />
    </main>
  );
}
