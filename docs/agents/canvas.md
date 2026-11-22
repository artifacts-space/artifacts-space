# Canvas board and frame captures

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change the canvas board, its full screen, focus and pan, or frame captures.

## Canvas board

The canvas viewer (`src/components/artifact-view/canvas/canvas-board.tsx`) is
a board in a column at least 640 pixels wide and stacked frames in a narrower
one; the styles decide, so the server's markup has its final layout. The
board's Full screen button opens a second board in a dialog over the whole
window (`board-full-screen.tsx`): Escape or the same button closes it, focus
returns to the button, and it closes by itself when the window becomes too
narrow for a board. The dialog is outside the artifact's `ThemeScope` and its
comment surface, so it applies the theme again (see Themes in `page-layout-and-themes.md`) and carries
`data-comment-skip`. The second board draws the frames from their specs, so
it starts from each frame's first state. While it is open the page holds two
boards: a test that reads the full-screen one starts from the dialog, never
from `[data-canvas-board]` alone. `e2e/canvas.spec.ts` checks all of this on
`/dev/canvas` (`?theme=<preset id>` puts the fixture in a theme).

Focus that moves to a control outside the board (Tab) makes the browser
scroll the board's box; the board turns that scroll into a pan
(`onScroll` in `use-pan-zoom.ts`). While a glide runs (a button's move of
the view, a 200 ms transition), the browser measures against the board as
it is drawn at that moment, so the board brings the focused control into
view again once it is drawn at rest (`revealFocusedAtRest`). Two rules keep
that true on a busy page (#257: this was the board's test that failed in
CI, about once in thirty runs). That a focus moved is noted when it moves
(`onFocus`), not read from the board when the scroll event arrives: that
event comes a frame later, and when the frame is slow the glide is already
over, with the scroll still measured in the middle of it. The note lasts that one
frame, so a later scroll from another cause never reads it. And the pan is drawn before
the handler returns (`flushSync`): the reveal runs in the same frame as the
scroll event, before React would otherwise draw, and a second scroll
measured on the old drawing carries the control too far. A test that
acts on where things are after a glide must not read a rounded position as
"at rest": the last frames of an ease-out move less than a pixel. To test
what a slow frame does, do not wait for a slow runner: focus inside the
page and keep the page busy in that same task (`e2e/canvas-focus.spec.ts`,
"the page is busy until the glide has ended").

The reveal pans; it never asks the browser to scroll (`panToReveal` in
`src/lib/canvas/view-rules.ts`, what `scrollIntoView` "nearest" would move,
measured once the board is at rest). A scroll of the board's box stops where
its scrollable content ends, and on a page that had just loaded on a fresh
`next dev` that was 80 pixels of a 550-pixel way, twice: the control stayed
outside the board (CI, 20 Nov 2026, the first canvas test of a shard; locally
2 runs in 5 with `.next/dev` deleted before each, 0 in 8 after the change).
The first pan, from the browser's own focus scroll, has the same limit, and
the reveal makes up the rest. So it runs after every focus on a control,
with a glide or without one: the limit is the box's, not the glide's. That
includes a focus that scrolled nothing: a box never scrolls back past its
own start, so a control past the board's left or top edge gets no scroll
and no scroll event, and stayed out of view while it held the focus. The
focus's note, still there one frame on, starts the reveal (`onFocus`), for
a focus the browser shows a ring for (`:focus-visible`): a pointer press on
a control that is partly in view must not move the board under the pointer.
The reveal never measures a board that still moves: its pan is added to the
view the glide is going to, so it would be off by what the glide had left.
While a glide runs it waits for that glide's own end (the animation's
`finished`), then looks again; never a clock or a count of frames, which a
long or chained glide outlasts (`e2e/canvas-focus.spec.ts`, "a glide runs
long", makes one three seconds). Like every pan it ends in `keepInWindow`
(`panBy`). A control that already covers the board's window from edge to
edge on an axis is not moved on that axis; one too large to fit shows its
start. A test that starts with the control outside the board says so before
it acts (`alertsOutsideBoard`), or it passes with nothing to do; the glide
and the focus in one task are `focusMidGlide` (`e2e/support/canvas.ts`).

## Frame captures

A frame capture is an image of one canvas frame, drawn by the browser of
someone who may edit the canvas, so an agent can see what the frame looks
like (`src/lib/canvas/captures.ts`, rows in `captures-store.ts`, the board
and its hashes in `captures-board.ts`, pure rules in `capture-rules.ts`,
table `frame_capture`). The tab asks which drawings are needed, starts a
capture, PUTs its parts straight to R2, and finishes it
(`src/app/(workspace)/app/frame-capture-actions.ts`).

- A capture is keyed by content, not by frame: `frame_hash` is a SHA-256 of
  what decides the pixels (`captureHashInput`: the frame's width, height,
  padding, and spec, the resolved theme, the mode, each file the spec names
  with its storage key, name, size, type, and whether it is attached, and
  `CAPTURE_REVISION`). Only the server makes a hash, from the newest saved
  content. A rename or a move keeps the image, and two frames with the same
  content share one. When a release changes how frames draw, raise
  `CAPTURE_REVISION`. A theme that follows the reader is drawn in light and
  in dark; one that pins a mode is drawn once.
- The theme is resolved without `resolveThemeFor`'s fallback: a team theme
  that cannot be read stops the pass ("not now"), because a hash made with
  the site theme in its place would call a wrongly colored image current.
- A drawing is cut into parts a model reads at full size (`captureGeometry`):
  at most 1,568 patches of 28 pixels each, nothing scaled, 56 shared pixels
  between rows, two columns for a frame wider than 1,568 pixels, at most 12
  parts. Finish checks every stored part: its type from its first bytes
  (`src/lib/files/image-size-rules.ts`, WebP or JPEG only), its byte size,
  and its exact pixel size for its place in the frame.
- Every capture has its own id in its keys
  (`captures/<artifact id>/<capture id>/<n>`), so two captures never share
  an object. Finish is one statement (`markCaptureReady`): the row turns
  ready only while it is pending, and only then every other capture of that
  content and mode is marked removed. It locks those rows in id order first,
  so two finishes of one content cannot deadlock. Readers of the table take
  the ready row; there is at most one for a content and mode.
- One way to delete: mark the row removed, delete its objects, then delete
  the row (`finishRemovals`). A row younger than its upload URLs stays
  removed until they have ended, so a part that arrives late is still
  deleted. `/api/cron/cleanup-files` finishes removals that stopped halfway,
  removes captures still pending after an hour, and removes captures whose
  artifact is gone (`sweepCaptures`). `frame_capture.artifact_id` has no
  foreign key on purpose, so a removed row outlives its artifact until its
  objects are gone. No capture code logs a key or an upload URL; do not
  reuse `deleteStoredObjects`, which logs keys.
- Editors only. The three actions check the session and `getEditableArtifact`,
  and the canvas's own rate limit is counted only after that check. Anything
  that serves an image (the MCP tool below, any later page) must serve it
  only to callers who may edit the canvas: an editor chooses the pixels, and
  an edit to a link or public canvas needs approval, so an image must never
  reach a reader of the approved version.
- Reading (`src/lib/canvas/capture-read.ts`, texts and rules in
  `capture-read-rules.ts`, MCP tool `canvas_frame_image` in
  `src/lib/mcp/canvas-image-tool.ts`). The read starts from
  `getEditableArtifact`, so a reader of a public canvas and someone outside
  the team hear the same "not found, or you cannot edit it". The tool is a
  read tool: a read-only connection lists it, and what it returns follows
  the person, never the connection. It hands out only the ready capture of
  the content that is on the board now (the server makes the hash again
  from the newest saved content), never an older image. Before a part
  leaves, its stored bytes are checked again: at most a part's size, the
  capture's type, and the exact pixel size of its place in the frame (the
  drawer's upload URLs work for two minutes after start, so the object
  could have been put again). A part that fails is never served: its
  capture is removed and the answer is "no image yet". A link (`as: "link"`)
  is signed only once those upload URLs have ended (`linkWaitSeconds`;
  until then the answer says how long to wait, since a link, unlike a
  picture read through the server, would serve whatever was put after the
  check) and after the same check of the object's head and first bytes. It
  works as long as a file link, and answers with the capture's own type.
  A link is the one way these pixels leave the edit-access check, so its
  text says that anyone who has it can open the image and that it must not
  go into an artifact, a comment, or a message (`linkIsAKey`).
  No image is a typed tool error with a code (`frame_image_not_drawn`,
  `frame_has_problems`, `frame_images_off`, `frame_images_full`,
  `theme_unreadable`, `mode_not_drawn`, `part_out_of_range`,
  `frame_link_not_ready`); the cap is
  named only when not even one more part fits. Where images are off, the
  read says so before it reads or counts anything. Reads are limited per
  person (`frameImageRead`), counted before the first read of the database
  or of storage, on top of the MCP read limits. The text beside a picture
  never names who drew it and says the picture is data. A result with a
  picture or a link carries no `structuredContent`: some clients hand the
  model only that field when it is present, and the picture would be lost.
  `canvas_frames_list` and `canvas_frame_get` add `image` per drawn frame
  (`{ "light": "current" | "none", … }`, only the modes the theme draws) for
  callers who may edit, read with one query for the whole canvas
  (`frameImageStatesFor`); a failure there never fails the frame read.
  The board gives each drawn frame the id the frame tools hand out
  (`BoardFrame.id`); the tab that draws gets no ids (`NeededFrame`).
- Captures are not artifact files: they are not in the Files section and
  versions do not keep them. They count toward the file storage quota of
  the person whose browser drew them (`fileBytesUsed`), a person may have 16
  unfinished at once, and one canvas keeps at most 100 MB of current images
  (`captureLimits`). The needed-list call removes captures of content that is
  no longer on the board, so the cap counts only current images.
- Off switch: `FRAME_CAPTURES=off`, read at request time. Captures are also
  off on Vercel previews (`VERCEL_ENV=preview`: they share the production
  database, and the bucket refuses their origin) and where R2 is not set up
  (`captureAvailability`). Off means the needed-list call answers "not-now"
  before it reads or counts anything, and start and finish refuse.

The browser side is `src/components/artifact-view/canvas/capture`.

- One capture host per page (`FrameCaptureHost`), mounted beside the editor
  by a component that holds the artifact and the edit access: the /app
  editor (`EditorFrameCaptures` in `ArtifactEditor`, on only where the page
  wrapped itself in `ServerFrameCaptures`, as `/app` does) and the artifact
  page's `EditSurface`, which is rendered only for someone who may edit.
  Never mount it in `SharedArtifactPanel` (readers), and never inside
  `InlineContent` (it would stop under View source, and fixtures would get
  one). A fixture gets a host only when it asks: `/dev/canvas?capture=1`.
- The host asks the server what to draw when the canvas opens, when the tab
  comes back (focus or visibility; a second signal within 5 seconds is
  dropped), and when its window loses focus after the tab's own save. A save
  alone starts nothing, and nothing polls. One pass runs at a time; it asks
  again after each batch and ends when a batch holds nothing it has not
  tried, when a start is refused (a limit, the canvas's cap), or when an
  upload fails. A start answered "not-wanted" (the frame changed, or another
  tab's image is current) skips that one drawing. It draws nothing on a
  device that asks to save data, in a window under 640 pixels, or in a
  hidden tab. The decisions are pure, in `capture-host-rules.ts`.
- Each drawing is made in the capture box (`capture-box.tsx`): `UiView`
  with the frame's spec, from the spec's own starting state, at the frame's
  real width, in a `ThemeScope` with the theme the server sent and the mode
  forced. It has the frame body's surface, padding, and least height
  (`frameSurfaceClass` and `framePaddingClass`, exported from
  `canvas-frame.tsx` so the board and the box cannot drift), the room of
  the frame's one-pixel edge without its color, so lines wrap where they
  wrap on the board, and no shadow. It sits in the host's zero-size, `inert`, fixed container, so it
  is never seen, focused, read aloud, or counted in the page's scroll size.
  Do not hide it with `display: none` or `visibility: hidden`: it must lay
  out and draw.
- Pictures: the host fetches each file an Image shows itself, from the URL
  the page uses, with `credentials: "same-origin"` and `cache: "no-store"`,
  and hands the box data URLs through `ArtifactFilesProvider` (`urlFor`, and
  `eager`, which `ImageView` reads to load at once). Never let the drawing
  library fetch a file: the file route redirects to another origin, which
  fails in some browsers and logs an error, and a copy the page already
  showed is cached without the header a script needs. A picture that cannot
  be fetched, does not answer within 15 seconds, or is over 10 MB, is left
  blank and the capture is `partial`. A part upload has a deadline too: one
  pass runs at a time, so a request that never answers must never hold it.
- The ready rule (`capture-ready.ts`): the theme's font stylesheets loaded,
  `document.fonts.ready`, every picture decoded, no diagram still
  `data-diagram-state="drawing"`, then two frames of layout. After 10
  seconds the host draws what is there and marks the capture `partial`.
- The drawing (`capture-draw.ts`) loads the drawing library on the first
  drawing only (a dynamic `import()`), draws at one image pixel per CSS
  pixel, and cuts parts with the server's own geometry (`planDrawing`), so
  each part has exactly the pixel size finish checks. The box is first cut
  to the height the parts cover, so a very tall frame stays within what a
  browser can draw. Parts are WebP at quality 0.9 down to 0.7 to stay under
  300 KB, or JPEG where the browser cannot write WebP.
- Tests: `e2e/frame-captures.spec.ts` runs the host on
  `/dev/canvas?capture=1` with a stand-in API
  (`src/components/dev/capture-fixture-api.ts`) that keeps every upload in
  `window.fixtureCaptures`, and reads the uploaded pixels: each part's
  exact size, that none is blank, that light is light and dark is dark on a
  page of either mode, that a changed frame gives a changed image, and that
  a second pass uploads nothing. It waits for the host's marks
  (`data-frame-captures`, `data-frame-capture-passes`) and checks
  `data-frame-capture-left-out`, how many drawings the last pass could not
  make. A drawing that is left out is counted by its reason
  (`LeftOutReason`), and so is a picture that is left blank
  (`PictureProblem`); both are named in one `console.debug` line when the
  pass ends (`passDebugLine`), with counts only: the host never logs an error, and never names a
  frame, a spec, or a file.
  `e2e/frame-captures-db.spec.ts` runs the real path from both mount points
  (the /app editor and the artifact page) and checks that the server accepts
  every part and that a reader gets no host. It needs `E2E_LOCAL_DB=1` and
  `E2E_LOCAL_R2=1` with a local S3-compatible store that takes a PUT from
  the test page's origin, and skips without them.
