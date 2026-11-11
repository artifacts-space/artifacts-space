# The artifacts.space Markdown dialect

Markdown is the stored format of a Markdown artifact. Agents read and write
it over MCP, people edit it in the rich editor, and the read view, the
public page, the Markdown version (`.md`), and the link preview text all
draw it. This file gives the exact Markdown form of every block, so all of
them agree.

The base is GitHub-flavored Markdown (GFM). The editor parses it with
[marked](https://marked.js.org) through `@tiptap/markdown`; the read view
renders it with `react-markdown` and `remark-gfm`. Where the two could
disagree, the editor keeps the source as written (see "Raw blocks").

## Rules for every block

1. **It has one Markdown form.** Standard GFM where one exists. New blocks
   use, in order of preference: GFM, GitHub alerts (`> [!NOTE]`),
   `<details>`, image syntax with options in the URL fragment (media), then
   fenced blocks or `:::` directives.
2. **It round-trips.** Markdown loaded into the editor and saved without an
   edit comes back byte for byte. Rendered fresh (after an edit), it keeps
   its meaning: parsing the fresh Markdown gives the same editor content.
   `markdown-roundtrip.test.ts` checks both for every sample in
   `block-corpus.ts`.
3. **Every surface draws it.** The read view (`markdown-view.tsx`), the
   public page, the Markdown version (`src/lib/markdown`), and the link
   preview text (`src/lib/og/text-utils.ts`).
4. **Agents learn it** from `artifacts_formats_guide`
   (`src/lib/mcp/format-tools.ts`).
5. **Unknown syntax is never lost.** Anything the editor cannot show stays a
   raw block with its exact source.

## Blocks

| Block | Markdown form | Editor node |
| --- | --- | --- |
| Paragraph, bold, italic, strike, code, links | GFM | `paragraph` and marks |
| Headings 1–6 | `#` to `######` (setext `===` reads too, and is kept as written) | `heading` |
| Bulleted, numbered, and task lists | `-`, `1.`, `- [ ]` / `- [x]` | `bulletList`, `orderedList`, `taskList` |
| Quote | `>` | `blockquote` |
| Code block | Fenced with backticks and an optional language. The fence is one longer than any fence inside. | `codeBlock` |
| Table | GFM pipe table with optional alignment | `table` |
| Divider | `---` | `horizontalRule` |
| Media: image, video, audio, PDF, file | Image syntax alone in its paragraph (below) | `media` |
| Anything else | As written | `rawMarkdown` |

### Media

An uploaded file shows in a document as image syntax, alone in its
paragraph: a blank line (or the start or end of the document) before and
after it.

```md
![Alt text](/api/files/<file id>)
![Alt text](/api/files/<file id> "Caption")
![Alt text](/api/files/<file id>#width=60 "Caption")
![Product walkthrough](/api/files/<file id>#video&width=80 "Two minutes")
![Customer interview](/api/files/<file id>#audio)
![Q3 report](/api/files/<file id>#pdf)
![budget.xlsx](/api/files/<file id>#file)
```

- **The URL** is the site-relative path `/api/files/<file id>`, where the id
  is the file's UUID. That route checks access on every request, so a media
  block never shows a file to someone who may not read it. Write it
  relative: the Markdown version makes link, image, and reference-definition
  targets absolute for readers outside the site (fenced and indented code
  blocks, also inside list items and quotes, and inline code, stay as
  written), and a save turns this site's own absolute file URLs back
  into the relative form (`absoluteFileLinks` and `relativeFileLinks`).
- **Options** follow `#`, joined with `&`, each at most once:
  - the kind: `video`, `audio`, `pdf`, or `file`. Leave it out for an image;
    `#image` reads as an image too, but is not written. When a URL names no
    kind, the read view shows the file as its type calls for (a video plays,
    a PDF opens; `shownMediaKind`).
  - `width=<10–100>`: a whole percent of the text column. Images and video
    only. Phones always use the full column. Without it, an image shows at its
    own size, never wider than the column.
  - When options are written, the kind comes first, then the width.
- **The text in brackets** is the alt text of an image, and the name shown
  for every other kind. It is plain text: Markdown punctuation in it is
  escaped with `\`, and an alt text with formatting or HTML character
  references stays a raw block.
- **The title** (`"…"`) is the caption, on one line. `"` and `\` in it are
  escaped with `\`. Single-quoted and parenthesized titles read too.
- **External images** (`![alt](https://…)`) become media blocks that never
  load. Images from other sites could track readers, so the read view shows
  their alt text and the editor shows a notice. Upload the image instead.
- **What stays as written (a raw block):** an image inside a line of text or
  with text on the next line, an image inside a list item, a URL with a query
  string or an unknown option, a relative path that is not `/api/files/`,
  and alt text with formatting. The read view still draws an upload inside
  text as an inline image.
- **Uploads attach on save.** Saving Markdown that names your own finished
  uploads attaches them to the artifact (`checkContentFiles` in
  `src/lib/files/attach.ts`); links to files you cannot use stay plain links
  that load only for people who may read those files. Every `/api/files/<id>`
  in the text counts, media and plain links alike (`markdownFileRefs`). The
  save reads the files the author may use, not the linked ids, so the
  author's own uploads are always found however many links come first, and
  the 50-file cap applies only to usable files, so many links never fail a
  save or a Restore.
- **Only documents hold media.** A ui artifact's Markdown block is text only:
  no media in its slash menu, and a pasted or dropped file is refused with a
  note, because ui saves attach only Image and File block files. Media
  already written in such a block stays as written. Full media in ui Markdown
  blocks is a later phase.
- **Content media and plain attachments.** A file a content save attached
  (the save named the editor's own upload, so the save attached it) is
  content media: `artifact_file.attached_by_content` (set by
  `attachFileRows`; see `src/lib/files/content-files.ts`). A file attached any
  other way (`files_attach`, the Files panel) is a plain attachment, even if
  content links it later. So is every file attached before the column
  existed: nothing records how those came in.
- **Access follows the artifact.** People who can read the artifact can load
  its media. Readers of the approved version (outside the team) load only
  files attached by that version's time, and never content media the
  approved version does not show (`served-images.ts`). Being content media
  is kept on the file row, so it holds after pruning deletes the versions
  that showed it. Plain attachments are never hidden this way.
- **Removed media is kept for Restore, then deleted.** A save that drops an
  embedded file always files its own version, so Restore brings it back
  (`dropsShownImage`). While only older versions name content media, it does
  not count toward the 20-file limit (`countHistoryOnlyFiles`); once no
  version names it, history pruning deletes it (`pruneUnusedContentFiles` in
  `src/lib/files/icon-cleanup.ts`). The row is deleted in one statement that
  checks the artifact's current content, icon, and cover, and every
  version's, again, so a save
  that has just written content naming it keeps it; then its R2 object goes.
  A file attached in the last five minutes is never deleted, as a margin for
  a save still in flight (an update writes its content, then attaches the
  uploads it names, so a refused save attaches nothing). Plain
  attachments are never deleted this way.

The rules are in `src/lib/files/media-rules.ts` (URL form, kinds, widths) and
`media-markdown.ts` (the block both ways).

### Raw blocks

A top-level block the editor cannot show as formatted text, or that would
not survive a round trip, loads as a `rawMarkdown` node holding its exact
source. It shows as an editable source box and saves unchanged. Today that is
raw HTML, footnotes, link reference definitions, images inside text, and any
block whose fresh rendering would change its meaning.

## Block node conventions

Every block is built so real-time co-editing (Yjs, later) needs no rewrite:

- **All state is in the document.** A node's attributes and content are plain
  JSON (strings, numbers, booleans, null). No DOM nodes, `File` objects,
  functions, or dates in attributes.
- **The Markdown comes only from the node.** `renderMarkdown` reads attributes
  and content and nothing else. A node that cannot be written yet (an empty
  or uploading media block) renders `""`, and the serializer leaves it out.
- **Transient state lives outside the document.** Upload progress, open menus,
  and drag previews live in React state or in a registry keyed by an
  attribute (`media-uploads.ts`, keyed by `uploadId`).
- **System updates skip the undo history.** When the editor, not the person,
  changes a node (an upload finishing), it dispatches with
  `addToHistory: false`, so Undo never puts a block back into a state that
  can no longer finish.
- **Attributes are read defensively.** Node views read attributes through a
  reader (such as `readMediaAttrs`) that falls back to safe values, since a
  collaborator or an old document may send anything.
- **Copy and paste inside the editor** keeps the node through `renderHTML` and
  `parseHTML` with `data-` attributes.
- **One view draws both sides.** The read view and the editor share the
  drawing component (`MediaBlock` in `src/components/artifact-view`); the
  editor adds only editing controls around it.

## Adding a block

1. Choose its Markdown form by the order in rule 1, and add it to the table
   above with its options.
2. Write the node in `src/components/editor/rich/` following the conventions,
   with a `markdownTokenizer` when marked does not already produce a token for
   it, and register it in `markdown-schema.ts`.
3. Add samples to `block-corpus.ts`, including forms that must stay raw. Run
   `pnpm test`.
4. Draw it in `markdown-view.tsx`, and check the Markdown version and the
   link preview text.
5. Explain it in `artifacts_formats_guide`.
