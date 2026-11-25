# Page host

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change anything that runs or serves an `html` artifact's page.

A page with scripts that an agent or a person wrote never runs on this site's
origin. It runs on a page host: `<label>.<PAGE_HOST>`, one host per artifact
on a second domain (`src/lib/page-host/rules.ts`).

- The label is a hash of the artifact's public id (`pageLabelFor`), 32 hex
  characters. Every reader already holds the public id, so no internal id
  reaches a reader for this. The label says nothing about the artifact: the
  public id is the key to a link-shared artifact, and the hash cannot be
  turned back into it. One host per artifact keeps each page's browser
  storage apart.
- A page host serves two things: the frame document (`frame-document.ts`),
  at `/`, for a page with files of its own at `/f/<token>/index.html`, and
  at the address of every other page of its site (`/f/<token>/about.html`,
  `pageAddressPattern`); and that page's files, at `/f/<token>/<path>`
  (see `page-files.md`). The rule, in one line: a page host never serves a
  document its author wrote. The only document it serves is the frame
  document, and every page, the first and any other, reaches the frame
  because the frame document's script writes it in. The proxy answers
  every request whose Host looks like a page host before any app code
  (`pageHostResponse`, and the matcher's last entry): the frame document, a
  404, or a 405. It lets two kinds of request through, both GET or HEAD on
  a page host of this deployment, to one route handler
  (`src/app/f/[token]/[...path]/route.ts`): a page file
  (`/f/<token>/<path>`), and the frame document's own fetch of another
  page's source (`isPageSourceRequest`, see `page-files.md`). That route checks
  the Host again and answers 404 on every other host. No app page, API, or sign-in
  exists there, so no session can, and a page has nothing of ours to call
  but its own files. `pageHostPattern` (in `security-header-rules.ts`) is
  the one literal the matcher and the header rules share; a test keeps the
  matcher's copy equal. Never add another route that answers on a page host.
- The page host reads no session and no cookie. The site's page
  (`PageFrame`) shows the frame document in a sandboxed iframe and hands it
  the HTML with `postMessage`, to the page host's origin only. So the
  access check for the page's content stays where it was: whoever was given
  the content can run it. The page host reads one thing from the database:
  a page file, for a token it can open. Never put a session, a cookie, a
  public id, or an artifact's id in a page host address; the only thing
  that goes there is the page files token, which is opaque and short-lived.
- The frame document takes the page from the window that frames it, and only
  when that window is the site (`framingSite`: `siteOrigin()` in production,
  never the request). Its `frame-ancestors` names the site alone, so the
  address shows nothing in a tab of its own; at another page's address it
  also fetches nothing there (`window.parent === window`).
- What a page may do is the frame document's Content-Security-Policy
  (`pageContentPolicy`): inline scripts run; other requests go only to the
  page's own host (`'self'`: scripts, styles, fonts, images, media, fetch,
  and workers, which is how it loads its page files) and to the public
  package and font hosts in `pageScriptHosts`. No request to this site or
  to any other site; no form posts; no frames; no `<base>`. `'self'` is one
  artifact's host, where only the frame document and that page's own files
  answer. A page cannot loosen it. Add a host to the list only for a
  public, read-only package or font host.
- The iframe's sandbox (`pageSandbox`) never has `allow-top-navigation`,
  `allow-downloads`, or `allow-popups-to-escape-sandbox`: a tab the page
  opens keeps the sandbox. A page can still send its own frame to another
  address; the site notices and closes the frame (`usePageHandshake`,
  `PAGE_ANSWER_MS`). After each load of the frame the site asks a question
  with a fresh id, and takes an answer only from the frame's window, from
  the page host's origin, with that id. A document of another origin cannot
  answer. Nothing in the frame document is a secret from the page: the two
  share a window, so never rely on one.
- The site-wide header rule skips page hosts (`missing` host), because its
  `frame-ancestors 'none'` and `X-Frame-Options: DENY` would stop the site
  from framing the frame document. `pageHostResponse` sends its own
  headers, and so does the page file route (`pageFileHeaders`).
- Known limit: hosts under one page domain are the same site to a browser,
  so a page can set a cookie for the whole page domain that another
  artifact's page can read. Nothing of ours reads cookies there. Listing
  the page domain on the Public Suffix List would close it.
- The page domain serves frame documents and page files, and nothing else. A wildcard
  (`*.<PAGE_HOST>`) sends every host under the domain to this app, so a
  host there that is not a page host (`www.<PAGE_HOST>`) must never show
  the site: it would be the same site, to a browser, as pages that run
  anyone's scripts. Two rules hold it: a rewrite in `next.config.ts`,
  checked before any file or page, sends every path of every host under
  the page domain to `/page-host-refusal`, a 404 (`pageDomainRewrites`);
  and the proxy refuses those hosts on the paths it runs first
  (`isUnderPageDomain`). The rewrite leaves out one shape of path,
  `/f/<token>/<path>` (`pageDomainRewriteSource`), or it would take a page
  file's address on a real page host too; on a host that is no page host
  the proxy and the route both answer 404 for it. The rewrite is read when the app is built, so
  `PAGE_HOST` is set for the build as well as at run time. The domain
  itself (no label) is not covered: never point it at this app.
  `rules.ts` has no `@/` import, because `next.config.ts` loads it.
- The `html` format is what runs there (`src/lib/html/rules.ts`,
  `HtmlView`). Its save check only asks for `<!doctype html>` at the start:
  the content is never parsed or sanitized, because the sandbox is the
  boundary. Never render HTML content any other way: not with
  `dangerouslySetInnerHTML`, not in an iframe on this origin, not through
  `srcDoc`. A view shows the running page only inside `ServerPageHost` (the
  artifact page and `/app`); everywhere else, and where no page host is
  set up, `HtmlView` shows the source as text. `pageKey` on `ArtifactView`
  is the artifact's public id. Link previews and search read the page as
  text (`htmlText`), never as markup. Readers of a link-shared or public
  HTML page who cannot edit it see a note that the page is its author's,
  with the Report link (`SharedPageNotice`). Agents read the rules in
  `buildHtmlGuide`, which lists the same hosts as `pageContentPolicy`; a
  test keeps them equal.
- Full screen (`PageWindow` in `html-view.tsx`): a bar of this site's sits
  above the running page, and its button puts the page's box over the whole
  window and back. The box and its frame stay the same elements, shown in
  the browser's top layer (`popover`), so the page keeps running and keeps
  what the reader did in it; never draw a second frame for it, which would
  load the page again. A fixed box alone is not enough: the /app pane's
  body is a size container, which holds a fixed box inside it. The bar
  stays in full screen with the artifact's title, so a page anyone wrote
  never has the whole window to itself, and the frame gets no
  `allowfullscreen`. Escape leaves full screen from the bar and from inside
  the page: keys pressed in the page stay in its frame, so the frame
  document tells the site (`pageMessages.escape`) about an Escape the page
  did not use. One that closes a dialog or popover of the page's
  (`:modal`, `:popover-open`, asked one at a time: a list with a selector
  the browser does not know throws as a whole), or that a listener of the page stopped
  (`preventDefault`), stays the page's. The page can send that message
  itself; all it does is leave full screen. The bar's button is always
  there, for a page that keeps Escape.
- `PAGE_HOST` unset (and not `next dev`): no page runs, and `PageFrame`
  draws nothing (`usePagesCanRun`). Tests: `rules.test.ts`,
  `frame-document.test.ts`, `frame-document-pages.test.ts`,
  `proxy.test.ts`, `e2e/page-frame.spec.ts` on `/dev/page-frame`,
  `e2e/page-files-sites.spec.ts`, and `e2e/security-headers.prod.spec.ts`
  for the production build.

## Pictures of pages

`artifacts_page_image` lets an agent see the page it saved: a hosted
browser (Cloudflare Browser Run's screenshot endpoint) draws it on request
(`src/lib/page-render`). The page runs exactly as readers see it, never
any other way:

- The browser opens the site's render page,
  `/render/page/<render token>` (`src/app/render/page/[token]/page.tsx`):
  one `PageFrame` that fills the window, with nothing of the site around
  it. So the page runs on its page host, in the same sandbox, under the
  same policy, with its page files. Never send the browser the HTML
  itself (its `html` field): the page would run with no sandbox and no
  policy, on an origin with nothing to keep it in.
- The render token (`token.ts`) is sealed with a key of its own derived
  from the server secret. It holds who asked, the artifact's internal id,
  and the save it is for (`updatedAt`), works for two minutes, and shows
  none of them. It grants nothing alone: the render page runs the edit
  check again as that person (`loadRenderPage`), a later save makes it
  open nothing, and the frame's files address comes from
  `pageAddressFor` as that person, for that artifact only
  (`renderPageAddress`). The page never sees the token: it runs on its
  page host with its own page files token. Never log a render token or the
  render page's address.
- Editors only, as for frame captures (see `canvas.md`): an edit to a link
  or public page can wait for approval, so a picture of the latest save
  must never reach a reader of the approved version. The tool is a read
  tool; what it returns follows the person.
- Where `CLOUDFLARE_BROWSER_RUN_TOKEN` is unset the tool says pictures are
  off (`page_images_off`) before it counts or reads anything. Draws are
  limited per person (`pageImageRead`), counted before the edit check,
  since each one runs a browser the site pays for.
- The draw fits inside the MCP route's `maxDuration` (30 seconds): the
  browser's waits (`pageImageLimits`) fit in the request's own limit, which
  leaves the route time for the edit check and the answer, so a slow page
  comes back as `page_not_drawn` and not as a call the platform cut off.
  `rules.test.ts` reads the route's number; change both together.
- What comes back is checked before it reaches a model (`checkedPicture`):
  a WebP of the window's exact size, within `pageImageLimits.maxBytes`. The
  window holds at most 1,568 patches of 28 pixels, as a frame capture's
  part does. The text beside the picture says it is data.
- A refused render (a token that does not open, a person who lost edit
  access, a later save) draws one note and no frame, the same for every
  reason, so the browser never finds the frame it waits for
  (`pageShownSelector`) and the tool answers `page_not_drawn` or
  `page_changed`. It is not a `notFound()`: with Cache Components the
  shell has streamed by then, so it could not send a 404 anyway.
- The render page is noindex, sends no referrer, and is disallowed in
  robots.txt. The browser reaches it from the internet, so it cannot draw
  a page on a local `pnpm dev`, nor on a preview behind Vercel's
  deployment protection; unit tests replace the browser at `drawPage`, and
  `e2e/page-render-db.spec.ts` opens the render page as the browser would.

