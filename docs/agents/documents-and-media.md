# Media and files in documents

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change uploads, images, or files in a Markdown artifact, the image viewer, attached files, or Replace.

## Media in documents

Markdown artifacts embed uploads as image syntax alone in a paragraph,
`![alt](/api/files/<id>#<options> "Caption")`; the dialect, with every
block's Markdown form and the block node conventions, is
`src/components/editor/rich/markdown-dialect.md`. The URL rules live in
`src/lib/files/media-rules.ts`. Embedded files follow the icon and cover
rules above: a save attaches the editor's own uploads it names, a save that
drops one files its own version so Restore brings it back, and readers of the
approved version never load a file that version does not show
(`served-images.ts`). Only content media, files a content save itself
attached (`artifact_file.attached_by_content`, set in the save's own
statement by `writeAndAttach`), follows these rules: hidden from readers of a version
that does not show it, not counted toward the file limit while only older
versions name it, and deleted once none does (`icon-cleanup.ts`). Content
media has its own limit: an artifact shows at most 100 files in its content
(`fileLimits.maxInlineFilesPerArtifact`), counted apart from its 20 plain
attachments (`maxFilesPerArtifact`) and from page files. Both numbers are
read from `src/lib/files/config.ts` through `src/lib/files/limit-rules.ts`
(`hasRoom`, `fullMessage`) by the server check (`attach.ts`), the editor's
words, and the docs; never write either number anywhere else. Files
attached any other way (`files_attach`, a Files artifact's section, the
Files panel documents had before, and all files from before the column) are
plain attachments that pruning never removes, even after content links
them. A ui artifact's Markdown block is text only
(`media={false}`). Images from other sites never load. Add each new block
to `src/components/editor/rich/block-corpus.ts` so the round trip is tested.

## Images in a document

- **An image opens larger in place** (`src/components/artifact-view/image-viewer/`,
  `useImageViewer`). A reader's click on an image, or Enter on its "Open
  larger" control, opens it. In the editor a click still selects the block;
  a double-click or the toolbar's "Open larger" opens it, and "Open in a new
  tab" stays. The viewer is one top-layer dialog (Base UI `Dialog`) over the
  whole window that draws the picture the page already loaded: caption,
  alt text as its title, Download, Close, Previous and Next through the
  document's images in order ("2 of 5", arrow keys, no wrap), Escape. It
  carries `data-comment-skip`, reads the page's theme through
  `ThemeSourceContext`, never animates, and never blocks pinch zoom. The
  step buttons stay focusable when disabled (`focusableWhenDisabled`): a
  button that drops the focus as it turns off takes the arrow keys with it.
  Focus returns to the image's control, or to the image the viewer ended on.
- **The viewer has a link of its own, and Back closes it**
  (`src/lib/block-links/image-view-rules.ts`, `image-view-history.ts`):
  `#block-file=<file id>&view=1`. A click adds one history entry; Previous
  and Next replace it, so one Back closes the viewer however far someone
  stepped; Close and Escape go back over the entry the page added, or
  replace the address with `#block-file=<file id>` when someone arrived on
  the link. A link with `&view=1` opens the viewer on arrival; a link to the
  block alone (`#block-file=<file id>`) lands on the block and highlights
  it, as before. There is no route for the viewer: it shows only images the
  page drew, so a reader of the approved version sees that version's files
  and nothing else.
- **An image keeps its place before it loads.** `finalizeUpload` reads the
  pixel size from the stored file's first bytes (`image-dimensions.ts`: PNG,
  GIF, WebP, JPEG with its camera orientation, AVIF with its turn) and keeps
  it in `artifact_file.width` and `height`; each side is 1 to 65,535 or
  nothing is kept (`keptDimensions`), so bytes that lie cannot reserve an
  absurd box. A page's own files (`pagePath`) and other types store none.
  Replace moves the new size onto the row and the old one onto the copy;
  `FileDto.width` and `height` carry it, and `MediaBlock` puts it on the
  `<img>` as `width` and `height`. Files from before the columns keep the
  fixed placeholder. A stored size that is not the loaded picture's own is
  dropped once it loads (`useImageShape`): never trust it over the picture.
- **Resize handles** (`media-resize.tsx`, `media-resize-rules.ts`): both
  edges and all four corners change `width=<percent>` (10 to 100, whole
  numbers). The edge handles are sliders named "Resize from the left edge"
  and "Resize from the right edge", tab stops while the block is selected:
  arrows move 5, Home and End go to the ends. The corners are for the
  pointer only. Handles are hidden on a phone.
- **The file card in the editor shows the type and the size**, from the
  document's files (`ArtifactFilesProvider` around the editor in
  `inline-content.tsx`) or, before any save, from what this tab's upload
  answered (`uploadedFacts`).
- **Cancel stops the request** (`putFile`'s `signal`, one `AbortController`
  per upload in `media-uploads.ts`), then discards the pending upload.
- **A small still image uploads as it is; a large one, or one that carries
  private data, is redrawn** (decided by the owner on 17 Nov 2026: "there
  is no need to redraw small images"; `documentImageToSend` in
  `src/components/images/document-image.ts`, rules in
  `src/lib/images/original-rules.ts`). A JPEG, PNG, or WebP keeps its own
  bytes, type, and quality when all of these hold (`keepsOriginal`): its
  longest side, as the browser decodes it upright, is at most 2400 px (never
  a header alone); it fits `documentPrepareProfile.maxBytes`; the size the
  server will store (`readImageDimensions` on the same bytes) is the size
  the browser draws, so a JPEG turned by its camera orientation keeps its
  place the right way round; and its bytes positively hold no private data
  (`findPrivateData` in `src/lib/images/private-data-rules.ts`). Private
  data, any one of which means a redraw:
  - where it was taken: the Exif GPS block, or XMP or text naming GPS, a
    location, a city, a state, or a country;
  - who took it, or with which one device: the Exif Artist, Copyright,
    CameraOwnerName, BodySerialNumber, LensSerialNumber, ImageUniqueID, and
    MakerNote tags and the author and comment tags 0x9C9B to 0x9C9F; XMP or
    text naming a creator (not `CreatorTool`), an author, rights, a
    copyright, an owner, or a serial; a PNG text chunk named Author or
    Copyright;
  - an embedded preview, which can show the whole frame of a picture
    cropped since: an Exif thumbnail (a second image directory, or
    JPEGInterchangeFormat), a JFIF thumbnail or JFXX extension, or XMP
    `xmp:Thumbnails` or `xapGImg`.
  A segment or chunk the check does not know, compressed text, text in
  UTF-16 or UTF-32 (a byte-order mark, or a NUL byte in the text), a file
  cut short, or bytes after the picture's end also mean a redraw: the check says
  "none" only for what it read. A small image sent as it is keeps its camera
  make and model, the time it was taken, exposure settings, the editing
  software, its orientation, a user comment, and its color profile, so a
  screenshot from a computer or a phone keeps its bytes. Anything else is
  redrawn as before: at most 2400 px, upright, camera data removed. AVIF,
  HEIC, and any type the check cannot read are always redrawn. When the
  file store refuses an image sent as it is before any byte goes
  (`UploadRequestRefused`), the redrawn image is sent instead if it is
  smaller. A GIF of at most `documentPrepareProfile.maxBytes` (8 MB)
  uploads as it is (`uploadsUnprepared`; a larger one is redrawn), and so
  does a WebP or PNG with more than one frame (`isAnimatedImage`: a WebP
  with the animation flag, an `ANIM` chunk, and two or more `ANMF` frames;
  a PNG whose `acTL` states more than one frame and that holds two or more
  `fcTL` frame headers). Neither is checked for private data, as before
  this change: a redraw would keep one frame. A file that declares
  animation but holds one frame is a still, checked like any other: a
  redraw keeps that frame and loses nothing. Never send a small still image as
  it is without the check: that would put a phone photo's location, its
  owner, or its uncropped preview into a shared page. Covers and icons still
  redraw every image (see Covers in `page-layout-and-themes.md`), because their redraw keeps them under the
  server's hard byte caps and, for covers, in the two types link previews
  draw.
- The fixture is `/dev/editor?kind=media&doc=gallery` (add `&as=reader` for
  the read view); `e2e/document-images.spec.ts` covers all of the above.

## Files in a document

Decided by the owner on 17 Nov 2026: "the base panel file upload UI needs
removed", files go "inline only". A document has no section for adding
files. A file goes into its text, as a block, where it was put.

- **A drop lands in the text, anywhere on the page.** The page marks its
  column as the document's drop zone (`dropZoneProps` in
  `src/components/editor/rich/media-bridge.ts`: the /app pane's
  `detail-outer`, and the artifact page's column for someone who may edit).
  The editor listens at the window, in the capture phase
  (`fileDragPlugin` in `media-input.ts`), and takes every drag that carries
  files inside its zone: the title block, the text, the space under it. So
  nothing under the window draws for it (the editor's own drop cursor is
  for text, and once stayed on the page as a stray line), and the browser
  never opens the file. A new drop target inside a document's page marks
  itself `data-slot="file-drop"`, which the editor leaves alone.
- **One line shows where the files land** (`media-landing.ts`): between
  two top-level blocks, above the block under the pointer in its upper half
  and below it otherwise, at the nearest block when the pointer is outside
  the text, and in place of an empty line. Each file is a block of its own,
  in order. The line is one element on `body`, fixed in the window (the
  pane's body is a size container, which would hold a fixed box inside
  it), and it goes on any drop, when the files leave the window, and by
  itself 1.5 seconds after the last drag event. Never draw a second line.
- **The New artifact page** takes a file itself only while it is empty
  (`pageTakesFiles` in `src/lib/create/new-artifact-rules.ts`): a code,
  SVG, or diagram file is read as the page's content, and any other file
  goes into the document (`askDocumentWhenReady`). The zone is then marked
  `"page"`, and the editor leaves the drop alone. A block whose file is
  still uploading is not in the saved content yet, so both sides ask
  `showsMedia` before they call the page empty. A page of another format
  (a table, code) gets a dropped file attached, as before
  (`use-blank-uploads.ts`). The web never makes a Files artifact (decided
  by the owner on 17 Nov 2026): the Format dialog does not offer Files
  (`offeredFormats` in `format-choice-rules.ts`) unless the artifact is one
  already. Agents still make them with `files_create_artifact`, and an
  existing one keeps its Files section.
- **No file of a drop is left out.** Every dropped, pasted, or picked file
  gets its own block at once, in order, however many there are
  (`insertFiles` in `media-input.ts`); never cap a drop. Uploads run three
  at a time (`maxUploadsAtOnce`, the queue in `media-uploads.ts`), so a
  large drop stays under the limit on unfinished uploads
  (`fileLimits.maxPendingPerUser`). A file that cannot be added (too
  large, a type that is not supported, empty, or one more than the
  document shows) keeps its block with the reason and Remove, and never
  uploads (`insertProblems`, `queueUpload` with a refusal); it has no Try
  again, since sending it again cannot work.
- **The source takes files too.** With View source open on a Markdown
  artifact, a dropped or pasted file uploads through the same queue and
  its line of Markdown is typed into the field as a paragraph of its own
  (`useSourceFileDrop` in `src/components/editor/source-file-drop.tsx`,
  rules in `source-media-rules.ts`): at the line under the pointer for a
  drop on the field, at the cursor otherwise. It is typed in with
  `execCommand("insertText")`, the one way a script's edit joins the
  field's Undo history, so Undo removes the line. Progress and refusals
  show under the field, by file name. A file past the 100 a document
  shows is refused before it uploads, in the editor's words
  (`sourceInsertProblems`): the files the source names and the files still
  uploading count against the room. `media-uploads.ts` is imported there
  statically, never on demand, so a failed load cannot drop a file with no
  word; it brings no editor with it.
- **A pasted link never downloads more than a file may be.**
  `fetchFromLink` refuses a stated length over the limit at once, and
  reads any other body through `boundedBody`, which stops and cancels the
  request one byte past `fileLimits.maxBytes`. Never read a linked body
  with `response.blob()`.
- **Files that are attached and shown nowhere stay reachable.**
  `looseFiles` (`src/lib/files/loose-rules.ts`) lists the plain attachments
  the content does not link and that are no icon or cover; the page shows
  them under the body as "Attached files" (`AttachedFiles` with `quiet`),
  with Open, Replace, Remove, and in a document "Add to document" on each
  row and "Add all to document" beside the heading, which put blocks that
  point at the files into the text (`askDocument` with `attached`): at the
  cursor once the editor has had the focus, at the end otherwise, in one
  undo step. The file is linked, never copied, and stays a plain
  attachment. Rows are not dragged into the text (left out on purpose).
  The list has no upload box and is drawn only while it has something to
  show. Never migrate such files into anyone's content.
- **Every other format with a quiet list attaches files beside its
  content** (`attachesBeside` in `loose-rules.ts`: code, text, JSON, CSV,
  SVG, a diagram, a web page). It has "Attach file" in the More menu (the
  /app toolbar and the artifact page's header) and beside the "Attached
  files" heading, and takes a file dropped anywhere on its page
  (`useAttachBeside`, `usePageFileDrop`). All three ask the one mounted
  list through a DOM event keyed by the artifact's id
  (`src/components/files/attach-bridge.ts`), and the list uploads and
  attaches through `attachFiles`, so approval and versions are as for any
  attach. A file that is refused says why in its own row, never in a
  toast. The artifact page mounts the list for editors only
  (`PageAttachedFiles`). A web page gets its own list instead
  (`PageFilesSection`, see `page-files.md`): there the controls say "Add
  files", a file whose type can be a page file becomes one at its path,
  and any other file is a plain attachment, as here. A document has none
  of this: its files go into its text. A Files artifact,
  an interface, and a canvas keep the Files section with its upload box
  (`filesPanel`): a Files artifact's files are its content, and an Image or
  File element names a file by the id copied from its row.
- A file leaves a document by deleting its block. An upload in progress can
  be cancelled, a failed one retried or removed, and the tab asks before it
  closes while one is on its way (`UploadingMedia`). A selected block's
  toolbar has Replace (a new upload in the same block, one undo step), Open
  in a new tab, and Download (`media-view.tsx`).
- A drag that started in the document (a block moved by its grip, a
  picture dragged by itself, which browsers also offer as a file) is the
  editor's own move, never a file drop (`view.dragging` in `takesDrag`).
- `e2e/document-files-many.spec.ts` drops 30 and 101 files, refused
  files, files on the source, and "Add all to document";
  `e2e/attach-file.spec.ts` covers "Attach file" and the page drop in the
  workspace and on the artifact page fixture (`/dev/editor?kind=json`).
- `e2e/document-files.spec.ts` drops, pastes, and picks files on
  `/dev/workspace` and on the page fixture (`/dev/editor?kind=markdown`),
  where uploads stay in the tab (`fixture-media.ts`), and reads where each
  block landed; `e2e/editor-media.spec.ts` covers the blocks themselves.

## Replaced files

Replace (a file's row in the Files section or in the list of attached files,
MCP `files_replace`, `src/lib/files/replace.ts`)
puts an editor's finished upload in place of a plain attachment. The
`artifact_file` row keeps its id, place, and name, so links and embeds open
the new file; what it held moves to `artifact_file_copy`. The swap is one SQL
statement, guarded on the key the editor saw, that also files the replace's
version (copied from the artifact row the statement locked) and writes its approval outcome (the edit request, or the new approved
version), so the file, its History entry, and its approval land together or
not at all. The approval is decided before the statement, which runs only
while the artifact keeps that visibility and team. A refused replace leaves
the file, its copies, the upload, and any request unchanged; steps before
the swap may still give the history its starting snapshot, or pin an
approved version to the artifact's current state where none existed, so
readers see no difference. The page discards a refused upload with
`removeUnattachedUpload`. A replace can
swap a row's object at any time, so code that deletes file rows reads the key
in the delete itself (`deleteFileRows`, `DELETE … RETURNING`).
Content media and icon or cover images (of the artifact or any version) are
never replaced; a file's row learns the version ones from
`FileDto.pictured`, which only full artifact DTOs load. Readers get the
current file, except readers of an approved version, who get the copy that
was current when it was saved (`download.ts`, never a newer one). Old copies
open only at `/api/files/<id>/copies/<copyId>`, for people who may edit, and
never cached. A copy is kept while any version in the history was saved while
it was current (`copies.ts`), goes with its file or artifact, and counts
toward its uploader's file storage quota.
