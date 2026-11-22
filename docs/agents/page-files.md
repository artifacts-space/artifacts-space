# Page files

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change an `html` artifact's own files, their tokens, renewal, uploads, or sites of several pages.

An HTML artifact can have files of its own that its page loads by relative
path, as on any website: `<link href="css/site.css">`, a module's
`import "./chart.js"`, `url(../img/bg.png)` in a stylesheet,
`fetch("data.json")` (`src/lib/page-files`).

- A page file is an attached file with a path: `artifact_file.page_path`,
  set when the upload is requested (`pagePath` on `files_request_upload`)
  and never changed. One file per path per artifact, with paths that differ
  only by letter case counted as one (the partial unique index
  `artifact_file_page_path_idx` on `artifact_id, lower(page_path)`). The
  path rules are pure (`rules.ts`): relative, `/` between parts, each part
  of letters, digits, dots, dashes, and underscores, no empty part, no `.`
  or `..`, no leading dot, at most 200 characters and 8 parts. The page
  itself is `index.html`, the artifact's content, so no page file takes
  that name at the top (in any letter case). Any other `.html` path is
  another page of the site (see Sites of several pages below); its name
  ends in `.html` in lowercase (`pageNamePattern`), and `.htm` is refused,
  so every stored page has an address the page host reads as a page's.
- The type comes from the path's extension alone (`typesByExtension`); a
  declared type is not read. HTML pages, stylesheets, scripts, SVG, fonts,
  and WebAssembly are types only a page file may be. They exist only as page
  files of an `html` artifact: an upload requested with a page path can
  only ever be attached as one (`canUseFileInArtifact`, and `page_path is
  null` in every plain attach statement: `attachFileRows`, the save's
  `attachedCte`, and the replace), and replaced only by an upload requested
  for the same path (`replacementPathProblem`). Their first bytes are
  checked on finalize (`matchesPageFileSignature`). They are never served
  inline from this site: on `/api/files/<id>` and on a signed storage URL
  they download as an attachment (`isInlineType`;
  `src/lib/files/page-file-inline.test.ts` fails if an HTML page, a
  script, a stylesheet, or an SVG ever becomes inline there), so Open on a
  page file's row downloads it. Never add a page-only type to
  `allowedFileTypes`.
- Limits are one constant (`pageFileLimits`): 100 page files and 16 MiB in
  all per artifact. The 20-file limit is for plain attachments only
  (`countArtifactFiles` leaves page files out). The attach is one statement
  that holds the rules itself (`attachPageFileRows`: the uploader's own
  ready uploads with a path, an `html` artifact, the count, the bytes).
  Two attaches at one moment can each pass that check, so the attach reads
  the totals again afterwards and takes its files back out when the
  artifact is over (`attachPageFilesWithinLimits`). One `files_attach` call
  with page files and plain files attaches both or neither: the plain
  files are checked first, and the page files are taken back out if the
  plain attach fails (`attachPlainOrUndo`). Attach, replace, and delete
  file a version through `recordArtifactChange`, like any file.
- The lookup matches a path exactly, letter case included, as a static web
  host does (`findPageFile`). Only the attach treats case twins as one, so
  a page never depends on which of two files a host would pick. The guide
  and the upload tool tell agents to use lowercase paths.
- Serving (`serve.ts`, headers in `serve-rules.ts`): the route streams the
  object from R2 (`openObject`); it never redirects, so a signed storage
  URL never reaches a page, and never reads a body into memory (the host
  caps a response that is not streamed). GET and HEAD only, one checked
  `Range` passed on. Headers: the type from the table, `nosniff`, the
  page's own policy plus `sandbox` (`pageFilePolicy`: a file opened as a
  document of its own, such as an SVG in a tab, runs nothing and has no
  origin), `Referrer-Policy: no-referrer`, `X-Robots-Tag`,
  `Cross-Origin-Resource-Policy: same-origin`, and a private cache no
  longer than the token's remaining life. Order: the Host must be a page
  host of this deployment, the path must be a page path, the token must
  open, then the per-network limit (`pageFileByNetwork`, by
  `networkPrefixKey`) is counted, then the database is read. A bad token
  costs no database read and no count.
- Every read of R2 by the server asks for the bytes as stored
  (`storedBytesOnly` in `src/lib/files/r2.ts`: `Accept-Encoding: identity`,
  signed), except a read with a Range, where `fetch` adds that header
  itself and a second, signed one would not match what is sent
  (`readHeaders`). R2 compresses a text type for a client that accepts it, as
  `fetch` does by default, and such an answer states no length, on a HEAD
  too. Without the header, finishing an upload refused every stylesheet,
  script, and SVG over about a hundred bytes ("the stored file is -1
  bytes"), and a page file would stream without a length or a usable
  Range. Local stand-in stores do not compress, so only `r2.test.ts`, which
  answers as R2 does, catches a read that drops the header.
- The token (`token.ts`) is the access check carried to a host that has no
  session. The site makes it only for a viewer who passed
  `getArtifactAccess` (`pageAddressFor` in `address.ts`, called by the
  server action `pageAddressAction` when a frame loads): AES-256-GCM under
  a key derived from the server secret with HKDF and its own purpose label.
  It holds the internal artifact id, which files (the latest, or "as saved
  at" a time), an expiry, and the save time of what the viewer is shown; the
  page host label is bound as authenticated data, so a token opens only on
  its own artifact's host. It ends 15 minutes after the start of its
  5-minute step (`pageTokenLimits`), so it works for 10 to 15 minutes, and
  within a step the same grant gives the same token (the nonce is derived
  from the grant), so a reload reuses the browser's cache. It names no
  viewer. An expired, changed, or other-host token is a 404; `token.test.ts`
  and `serve.test.ts` have a test for each that fails if access is granted.
  Never log a token, and never put anything else in a page host address.
  The page can read its own token (it is in its address). That gives it
  nothing new: the token serves only that page's own files, as that viewer
  gets them, and the page can read those already.
- A page that stays open keeps its files without loading again
  (`usePassRenewal` in `page-renewal.ts`, rules in `renew-rules.ts`). The
  site asks for the next address close to the end of the one in hand (two
  minutes before, `passRenewal`) and posts its frame path to the frame
  document (`pageMessages.renew`), which takes only the token from it and
  moves its own address to the same page, query, and hash under that token
  with `history.replaceState`, on whichever page of the site it is. The frame's `src` never changes: a new `src`
  would load the page again. When to ask is one decision (`renewStep`),
  taken when an address arrives, when the tab is shown or hidden, and when
  the timer fires: a shown tab holds one timer set from the known end. A
  hidden tab does the same for one hour after it was hidden (the owner's
  decision, 17 Nov 2026, `passRenewal.hiddenMs`), so music or video in a
  background tab keeps loading; after that hour it holds no timer and
  asks nothing, so an abandoned tab never asks the server for ever. A tab
  shown again with an address that ended or is close asks at once, and
  hiding it again starts a new hour (`usePassRenewal` records when the tab
  was hidden, and `renewStep` takes that moment). Browsers slow a hidden
  tab's timers (often to once a minute), so a timer decides from the clock
  when it fires, never from the delay it asked for: one that fires after
  the hour ends does not ask. Each renewal is still a request that checks
  access again (`pageAddress`, 3,600 an hour per person, about 6 requests
  for a tab renewing an hour). A refusal (the reader lost access,
  or no address could be made) ends it for that load: the page keeps
  running without its files. Never add an interval here, and never renew in
  a tab that has been hidden longer than its hour.
- Renewal runs on the browser's own clock, never the server's time of day
  (tripwire, found 17 Nov 2026). An address answer carries `expiresAt` and
  also `lifeMs`, how long it still works, measured on the server when the
  answer is made (`answerFor` in `token.ts`). The browser holds the address
  until `lifeMs` after the answer reached it (`endOnThisClock`: the first
  address in `page-frame.tsx`, each renewal in `renewalOutcome`), so
  `heldPass`, `renewStep`, and the timers compare only browser times. Never
  compare `expiresAt` with `Date.now()`: a device clock an hour ahead asked
  again after every answer until the hourly limit refused it and the page
  lost its files, and one an hour behind renewed too late. A `lifeMs` that
  is missing, not a number, or not above zero counts as no life.
  `renewalOutcome` takes an answer as a later address only when its token
  differs from the one in hand (the same grant gives the same token within
  a step), it ends later on this clock, and its own renewal is at least
  `passRenewal.minWaitMs` away; anything else is "same" (nothing handed
  over, asked again when the tab is shown or the browser is back online),
  so an answer can never set off an immediate new ask. After a sleep or a
  return from the back/forward cache the decision is still taken from the
  clock, so an address past its renew time is asked for at once. Known
  limit: the clock is `Date.now()`, so a device clock changed by hand
  while a page is open still moves the end held for that load.
- The frame document takes `renew` only from the window that frames it,
  only from the site's origin, and only when both the message's path and
  its own are a page's under a files address (`pageAddressPattern`:
  `index.html` or another `.html` page). `frame-document.test.ts` runs the
  script in a VM and fails if the page itself, another window, or another
  origin can move it. The page shares the window and could move its own
  address anyway; that gives it nothing, because a files address serves
  only that page's own files.
- Known limit, stated in the guide and the docs: what resolves against the
  document follows the new address (`fetch`, elements added later,
  `new URL(path, document.baseURI)`); a module that already loaded keeps
  the address it loaded from for its own later relative `import()` and
  `import.meta.url`, and a stylesheet file for its own `url()`. Those get a
  404 after the first address ended, until the page loads again. A file
  asked for in a tab that has been hidden for more than its hour, after the
  end of its address, also gets a 404. The life is one constant
  (`pageTokenLimits`); a longer life is a longer window after access is
  lost.
- Which files a viewer gets follows the version they are served, like
  every attachment: a reader of the approved version gets only files
  attached by that version's time, and the copy of a replaced file that was
  current then (`findPageFile`, `fileServedAt`), never a newer one. A
  version in History shows its own files, to people who may edit only
  (`PageVersionProvider`). Their address does not change when an edit they
  are not shown is saved. `page-files.db.test.ts` checks each rule against
  a real database.
- The frame (`PageFrame`): a page with page files loads at
  `/f/<token>/index.html` (`pageFramePath`), so its relative URLs resolve
  under `/f/<token>/`; a page without them still loads `/`. The name is
  needed: Next redirects a path that ends with `/`. The frame asks for a
  new address when the page's files change (`usePageFilesKey`) and before a
  load once the one it holds is near its end, not on every keystroke in the
  editor; while the page runs, the renewal above keeps it supplied. When no
  address can be made, the page runs at `/` without its files.
- Agents, one or two files: `files_request_upload` takes `pagePath`,
  `files_attach` attaches it, `files_replace` and `files_delete` change it,
  and every artifact result lists each file's `pagePath`.
- Agents, many files in few calls (`src/lib/mcp/page-file-tools.ts`):
  `page_files_request_uploads` starts the uploads of a whole set, and
  `page_files_publish` brings the page's files to a new state in one step:
  uploads at new paths are added, an upload at a path the page has replaces
  that file (the old one becomes an old copy, as in a single replace), and
  the paths in `remove` are deleted. Both check the whole set first
  (`planPagePublish` in `publish-rules.ts`: every path and size, a path
  named twice, a case twin of a held path, a removal of nothing, and the
  page's limits as the set leaves it) and refuse with one error that names
  every file at fault (`faultsMessage`). The request signs no URL and
  counts nothing until the set passes; then it counts the pending uploads
  (`pageBatchLimits.maxPendingUploads`), the hourly limit once per file
  (`pageFileUpload`, `enforceRateLimitHits`), and the storage quota for
  the set's total. One request starts at most 50 uploads, because an agent
  reads every signed address in the answer into its context; one publish
  names as many as an artifact holds, so a site of any size is still one
  version (`pageBatchLimits`, with the reasons beside each number).
- The publish is one statement (`runPagePublish` in
  `publish-statement.ts`), because neon-http has no transactions. It locks
  the artifact row and runs only while the artifact is still `html`, at the
  save the plan read (`updated_at`, to the millisecond), with the
  visibility and team its approval was decided for. It deletes the removed
  rows, swaps each replaced file's object after copying the old one to
  `artifact_file_copy`, attaches the new uploads dated at the save, files
  one version (`save_kind` `files`), writes the approval outcome
  (`approvalCtes`, shared with the replace), and stamps the artifact. Its
  last column divides by zero unless every part found exactly the rows the
  plan named and the page stays within its limits, so a mismatch fails the
  whole statement and nothing changes (`allOrNothing`, `isPublishRefusal`).
  Uploads still pending are finished first (`finalizeUpload`, eight at a
  time); an upload at fault stops the publish before anything changes.
  `baseVersion` is optional, as for the other file tools; with it, a save
  since is an `artifact_changed` refusal, and without it the publish is
  planned again on the new state (three times at most). An image the
  artifact or a version shows as its icon or cover is not replaced or
  removed. Removed files stop loading for every reader at once, as with
  `files_delete`; added and replaced files follow the version a reader is
  served. `publish.db.test.ts` and `page-file-tools.db.test.ts` check each
  rule against a real database.
- Tripwire: `files_attach` attaches page files in its own statement and
  stamps the artifact afterwards (`recordArtifactChange`), so a publish and
  a `files_attach` of page files at the same moment do not see each other.
  The unique index still refuses two files at one path, and the attach
  reads the totals again and takes its files back out
  (`attachPageFilesWithinLimits`). One order is not covered: a publish that
  started before the attach landed and finished after the attach's second
  read can leave the artifact over a page file limit by that attach's
  files. It needs two editors of one artifact in the same few
  milliseconds, and the account's storage quota still holds. Closing it
  means moving the page files of `files_attach` onto the publish statement.
- `buildHtmlGuide` tells agents the rules from the same constants: the
  batch flow first, what belongs in files, and the limit above.
- People, in the web app (`PageFilesSection` in
  `src/components/files/page-files-section.tsx`, mounted for an `html`
  artifact by the /app pane's `FilesSlot` and the artifact page's
  `PageAttachedFiles`, editors only). The controls say "Add files"
  (`attachLabel`) and the drop hint "Drop to add them to this page"
  (`dropHint`); every other format keeps "Attach file". "Add folder" picks
  a folder where the browser allows it, and a dropped folder is read
  through its entries (`readDrop` in `dropped-files.ts`, at most
  `maxFilesReadFromDrop` files).
  - A `.zip` dropped or picked by itself is unpacked in the browser and
    goes on exactly as the folder it holds would (`unpackDrop` in
    `unpack-drop.ts`, before `routeDrop`), with the reader in
    `src/lib/zip` (no dependency; stored and deflate only, caps in
    `pageZipLimits` in `src/lib/page-files/zip-rules.ts`, counted on what
    actually comes out). Entries become `File` objects and nothing else;
    the server checks every file as for any upload. Agents use the batch
    tools instead.
  - One gesture, the right result (`routeDrop` in `drop-rules.ts`, pure):
    a type in `typesByExtension` becomes a page file at its path in the
    drop; any other type the site takes is a plain attachment through
    `attachFiles`, as before; the rest are refused with the reason in the
    "Not added" list. A folder that holds the whole drop is the page's own
    folder and is left out of the paths (`pathsInDrop`); single files land
    at the top level. System files anywhere, and hidden files inside a
    dropped folder, are left out with one quiet line (`leftOutOfDrop`).
  - A path that cannot be used (the path rules, a case twin of a held
    path, a path two files of the set share: `reviewBatch` in
    `batch-rules.ts`, on `planPagePublish`) waits in its row with the
    reason and a field prefilled with `pathSuggestion`; it uploads only
    once the person takes a path. Nothing is renamed unseen.
  - A set goes the batch tools' way (`usePageBatch`): the server actions
    in `src/app/(workspace)/app/page-file-actions.ts` start the uploads
    in requests of at most `pageBatchLimits.maxUploadsPerRequest`
    (`requestPageUploads`, the hourly limit counted per file), the
    browser PUTs three at a time (`maxUploadsAtOnce`) and finishes each
    upload (`finalizeUploadAction`, so a refusal names its file in its
    row), and one `publishPageFilesAction` (`publishPageFiles`, actor
    `person`, no base) publishes the whole set as one version. A set
    publishes by itself unless it replaces a held file: then each row says
    "Replaces <path>" and the set waits for the person's button
    (`batchStep`); Replace on a page file's row is that word already.
    Cancel aborts every request and deletes the uploads; nothing is
    published. The tab asks before it closes while a set is on its way.
  - Rows of the page's files are sorted by path (`inPathOrder`), with
    Copy path, Open, Replace (a file of the same type, at the same path:
    `replacementPickProblem`), and Remove (a publish with `remove`, so it
    is a version like any change), under the room line
    ("12 of 100 files, 1.4 MB of 16 MB", `pageFilesTotalsWords`).
    Attachments follow, each marked "Attachment".
  - An `index.html` alone at the top of a drop is the page itself: its row
    offers "Use as this page's HTML", which puts the file's text into the
    editor's draft (the normal save path: a version, approval on a shared
    artifact) after the `usePageHtml` confirm. Any other HTML file is
    another page of the site: a page file at its path, in a row like any
    other ("HTML page"); an `.htm` one waits in its row with a path that
    ends in `.html` to take (`suggestPagePath`).
  - After a publish the editor takes the artifact the action returns
    (`onUpdated`), so autosave rebases on the files-only version and the
    frame loads again with the new files (`usePageFilesKey`).
  - Tests: `drop-rules.test.ts`, `batch-rules.test.ts`,
    `page-file-actions.test.ts` (session, input, and edit access before
    any service call), `dropped-files.test.ts`, the zip's
    `read-zip.test.ts` (on zips built by hand with `test-zip.ts`),
    `unpack-drop.test.ts`, and `zip-rules.test.ts`, and
    `e2e/page-files-web.spec.ts` and `e2e/page-files-zip.spec.ts` on
    `/dev/editor?kind=html` (`&files=1`
    starts with two page files), whose stand-in keeps page files in the
    tab (`src/components/dev/fixture-page-files.ts`).
- Sites of several pages (owner's decision, 18 Nov 2026). `index.html` is
  the artifact's content, the first page; `about.html` or
  `docs/guide.html` is a page file, linked with an ordinary relative link,
  and it opens in the same frame. It counts toward the same limits as any
  page file. How each address is answered:
  - A browser that goes to `/f/<token>/<page>.html` (a link, `location.href`,
    Back or Forward in the frame) gets the frame document, with exactly its
    headers, plus `Vary: X-Page-Source` (`pageHostHeaders` with `page`). The
    token is not read: the frame document cannot know. Under a files
    address (`index.html` too) the frame document is `private, max-age=3600`,
    never `public`: the address holds one reader's short-lived token, and a
    shared cache that ignored `Vary` could serve it for the page's source.
    Only `/` stays `public, max-age=3600` (`frameCacheControl`).
  - The frame document there says "opened" (`pageMessages.opened`, never
    "ready", so the site sends it no HTML), waits for the site's `renew`
    with the newest address (`onOpened` in `PageWindow`: the newest renewal,
    else the address the load started on; `usePassRenewal`'s `resend`
    returns whether it had one), moves to it, and fetches its own path
    with `X-Page-Source: 1`, `redirect: "error"`. It writes only an answer
    of type `text/plain` (never one served as HTML, such as the frame
    document from a cache), with
    the same `document.open()` / `write()` / `close()` steps, its ping and
    renew listeners added after `open()` and before the page's scripts, and
    says "shown". A 404 gets a line built from elements and text: "This
    page has no file at <path>." (an address that ended answers 404 too),
    and a link to the first page by relative path; any other failure says
    "This page could not be loaded", with the same link. At `/` and `index.html` it says "ready" and
    waits for the HTML, as before, so the site answers every "ready" with
    the HTML (a return to the first page is a new load).
  - That fetch is told from a navigation by the header
    (`isPageSourceRequest`): `X-Page-Source: 1`, and `Sec-Fetch-Dest` and
    `Sec-Fetch-Site`, when sent, must be `empty` and `same-origin`. Those
    two can only refuse: older browsers send neither. A navigation cannot
    carry the header, and another origin cannot send it without a
    preflight, which a page host refuses (405). The proxy lets it through,
    and the route answers with the page as `text/plain; charset=utf-8`
    (`servedContentType`: no page file is ever served as `text/html`),
    `nosniff`, the sandboxed file policy, and `Vary: X-Page-Source`. The
    token is checked as for any page file. An `.html` path asked for
    without the header gets the route's 404 before the token is read
    (`mayAsk`), should the proxy ever let one through.
  - A query or a hash is the page's own: the proxy and the route read the
    path alone, and the frame document keeps both across renewals.
  - Forms stay refused (`form-action 'none'`), and a link to another site
    or to a folder still leaves the frame, which the site closes
    (`usePageHandshake`). A folder's address (`docs/`) is no page: Next
    sends it to `docs` without the slash, which is a page file path with no
    type, a 404 the frame may not show; the site closes the frame after
    `PAGE_ANSWER_MS` with "Show the page again".
  - Known limits: no link from this site to a page inside the frame, no
    list of pages beside the frame, no search or link preview over pages
    other than the first, no folder index, and no `.htm`. The frame
    document does not scroll to a `#fragment` itself after writing a page.
  - Tests: `frame-document-pages.test.ts` (the script in a VM: nothing
    fetched or shown in a tab of its own, only the site's renew moves it,
    the missing line is text), `serve.test.ts` (the source as text only,
    every header case, token rules), `rules.test.ts` and `proxy.test.ts`
    (the answer by request kind, every host), and
    `e2e/page-files-sites.spec.ts` on `/dev/page-frame?page=files`, whose
    fixture has `about.html` and `docs/guide.html` with its own stylesheet
    and script (`fixture-source.ts`).
- Tests without a database: under `next dev` only, a token for the stand-in
  artifact id `fixture:page-files` is answered from files held in memory
  (`fixture-source.ts`), so `e2e/page-files.spec.ts` on
  `/dev/page-frame?page=files` runs the real proxy, token, route, headers,
  and frame. `serve.test.ts` fails if that source ever answers outside
  `next dev`. `?pass=short&run=<text>` gives that page a first address that
  ends within seconds and a usual one after it, and `?pass=refused` none
  after it (`fixtureShortPassAction`, `mintShorterPageToken`, which can
  only shorten a token's life), for the renewal tests in the same spec.
