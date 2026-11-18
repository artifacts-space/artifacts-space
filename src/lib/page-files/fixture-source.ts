import type { PageFileSource } from "./serve";
import { pageFileTypeFor } from "./rules";

/*
 * Development only: the page files of the fixture page
 * (/dev/page-frame?page=files), held in memory. serve.ts uses this source
 * only under `next dev`, for a token made for the fixture's stand-in
 * artifact, so e2e/page-files.spec.ts runs the real proxy, token, route,
 * headers, and frame with no database and no file storage. Only the lookup
 * and the bytes are stood in for.
 */

/** A page of the fixture's site: a whole document, as an author uploads one. */
function sitePage(title: string, head: string, body: string): string {
  return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title>${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

/**
 * The fixture page's files, by path. The stylesheet names a picture one
 * folder up, and the module imports its sibling. The other pages of its
 * site link back and to each other by relative path; the one in a folder
 * loads its own stylesheet and script from that folder.
 */
export const fixturePageFiles: Readonly<Record<string, string>> = {
  "about.html": sitePage("About", `<link rel="stylesheet" href="css/site.css">`, [
    `<h1 id="page">About</h1>`,
    `<p id="styled">Styled by the site's stylesheet</p>`,
    `<p><a id="to-index" href="index.html">First page</a> <a id="to-guide" href="docs/guide.html">Guide</a></p>`,
    `<form id="form" action="docs/intro.html" method="get"><button id="submit" type="submit">Send</button></form>`,
  ].join("\n")),
  "docs/guide.html": sitePage("Guide", `<link rel="stylesheet" href="guide.css">`, [
    `<h1 id="page">Guide</h1>`,
    `<p id="guide-styled">Styled by the guide's own stylesheet</p>`,
    `<p id="guide-script">Script did not run</p>`,
    `<p id="where"></p>`,
    `<p><a id="to-index" href="../index.html">First page</a> <a id="to-intro" href="intro.html">Intro</a></p>`,
    `<script src="guide.js"></script>`,
  ].join("\n")),
  "docs/intro.html": sitePage("Intro", "", `<h1 id="page">Intro</h1>\n<p><a id="to-guide" href="guide.html">Guide</a></p>`),
  "docs/guide.css": `#guide-styled { color: rgb(0, 0, 255); }\n`,
  "docs/guide.js": `document.getElementById("guide-script").textContent = "Guide script ran";\ndocument.getElementById("where").textContent = location.search + location.hash;\n`,
  "css/site.css": `#styled { color: rgb(0, 128, 0); }\n#pictured { width: 24px; height: 24px; background-image: url(../img/dot.svg); }\n`,
  "js/app.js": `import { message } from "./message.js";\ndocument.getElementById("module").textContent = message;\nfetch("data.json").then((response) => response.json()).then((data) => { document.getElementById("data").textContent = "answer " + data.answer; });\n`,
  "js/message.js": `export const message = "Module imported its sibling";\n`,
  "data.json": `{"answer": 42}\n`,
  "img/dot.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2563eb"/></svg>\n`,
};

const encoder = new TextEncoder();

function bytesOf(key: string): Uint8Array<ArrayBuffer> | null {
  const text = fixturePageFiles[key];
  return text === undefined ? null : encoder.encode(text);
}

/** The fixture's files as a page file source: the path is the key, and the whole file is always the answer. */
export const fixturePageSource: PageFileSource = {
  find: (_grant, path) => {
    const bytes = bytesOf(path);
    const type = pageFileTypeFor(path);
    return Promise.resolve(bytes && type ? { key: path, contentType: type.contentType, size: bytes.length } : null);
  },
  open: (file, options) => {
    const bytes = bytesOf(file.key);
    if (!bytes) return Promise.resolve({ state: "missing" });
    const body = options.head ? null : new Blob([bytes]).stream();
    return Promise.resolve({ state: "open", object: { status: 200, body, length: bytes.length, contentRange: null } });
  },
};
