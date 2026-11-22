# Block menu, block links, and comments

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change the rich editor's block menu, block colors, block links, inline comments, mentions, or the comment box.

## Block menu and block links

People who may edit a Markdown artifact get a handle beside each block in the
rich editor (on hover; always faint on touch screens) and a block menu from
the grip or a right-click (`src/components/editor/rich/block-menu`). Change
lists the block types in `block-types.ts`, one entry per type: add a type
there when the editor supports it. Duplicate, Move, and Delete are ordinary
transactions on the whole top-level block, or on a list item as an item
(`block-target.ts`), so Undo and autosave treat them like typing. The page
supplies the artifact through `BlockMenuFor`; editors without it (a ui
artifact's Markdown block) get no handles. The menu opens in one place
(`menu-placement.ts`): 265px wide, to the left of the grip, or to its right
over the block's text when the window has no room on the left (the left
needs 282px beside the grip, so with the contained page column it fits from
a 1588px-wide page area: a 1588px window with overlay scrollbars, about
1605px with a classic 17px one), centered on the grip and kept 12px inside
the window. It slides up or down to stay inside, never flips above or
below, and never scrolls the page. From a right-click it opens at the
pointer, to its right or to its left near the window's right edge, kept
12px inside the window too. Change and Color open on hover, 220px wide, to
the right of the menu (overlapping it 4px), or to its left near the
window's right edge. The menu stays transparent until placed, then fades in
over 150ms with no movement, and not at all under reduced motion. Keep it
that way; `e2e/block-menu-position.spec.ts` checks it by bounding boxes.
Readers get only Copy link to block on right-click
(`src/components/block-links`).

Color (text color and background) is a block attribute on paragraphs and
headings, stored in Markdown as a color comment at the end of the line's
text, `<!-- color: red; background: yellow -->` (markdown-dialect.md, "Block
colors"; rules in `src/lib/block-colors`). Every hue is a token pair in
`globals.css` (`--block-<hue>`, `--block-<hue>-bg`), light and dark, at
WCAG AA; themes re-light them for their own surfaces (`blockColorTokens` in
`src/lib/themes/derive.ts`). Add a hue in `globals.css`, `blockHues`, and
`block-color-palette.ts` together; tests check they match.

A block link names the block by its opening words, never by a stored id:
`/artifact/<id>#block=<words>[&n=<k>]:~:text=<words>`, or `#block-file=<uuid>`
for media, or `#block-at=<index>` for a block without text
(`src/lib/block-links/anchor-rules.ts`). The editor and the read view list
blocks the same way (each top-level block that is not a list, then every list
item, in document order), so a link built on one surface finds its block on
the other; `BlockLinkTarget` on the page scrolls to it and highlights it.

## Inline comments

A top-level comment on a Markdown artifact can sit on words in the text.
It stores no position: it keeps the words (`quote`, up to 1,000 characters)
and up to 64 characters before and after them (`quote_prefix`,
`quote_suffix`), and each surface finds the words again in the text it
shows (`src/lib/comments/anchor-rules.ts`, pure and shared by browser and
server). Matching ignores every space and line break, so the same quote
matches in the editor, the read view, and the Markdown an agent reads.
When the words are gone the comment stays in the list, marked as on text
that changed; nothing is deleted or moved by an edit.

The browser side is `src/components/inline-comments`. A provider per page
(`InlineCommentsProvider`: `/app` editor, the shared pane, the artifact
page) loads the thread once and shares it with the Comments list, so both
show one state. `InlineCommentSurface` wraps the document; it reads the
page's text (`dom-text.ts`) and paints the words with the CSS Custom
Highlight API (`::highlight(inline-comment)` in `globals.css`, block
yellow tokens), so it never changes the document's DOM or the editor's
content. The thread opens in a card at the words. The editor and the read
view must read the same words, so interface text inside the document is
left out (`SKIPPED` in `dom-text.ts`): an `svg`, a button, `.sr-only` text
(a link's "opens in a new tab"), an editor block's non-editable controls,
and anything under `[data-comment-skip]`. Put `data-comment-skip` on any
new label, caption, or notice you render inside a document. The words are
found again 150ms after the text last changed, not on every keystroke;
between passes a highlight is a live range and moves with its words. The
provider and the surface keep one tree shape whether inline comments are on
or off, so turning them on (a new artifact's first save) never remounts the
editor: keep it that way. The provider is on only for Markdown artifacts
that are saved and whose comments the viewer may write; everywhere else
Comment in the block menu opens the Comments dialog as before, and the
server refuses a quote on any other format. Highlights are not exposed to assistive technology: the
Comments list is the accessible way to every thread, so keep it complete.

Privacy rule: a quote is text of the artifact. A reader who is served the
approved version must never receive a quote, prefix, or suffix made on a
version that is not approved. `anchor-privacy-rules.ts` and
`served-anchors.ts` gate every path that returns comments (web thread,
inbox, `?comments=1` Markdown, MCP): the quote is returned only when it is
found in the text that reader is served, and the quote, prefix, and suffix
they get are all read from that text, never from the stored anchor. Add any new path that returns comments to that
gate. An agent's `quote` on `comment_create` must be in the text the agent
can read, or the call fails and saves nothing.

Resolve (`resolveComment`, `rules.ts`): people who can comment resolve and
reopen top-level threads; agents cannot. It is rate limited per person
(`RESOLVE_RATE_LIMITS`), because anyone who may comment may resolve.
Resolving twice keeps the first resolver. A deleted comment loses its quote.

Links to one comment (the Inbox, mention emails, MCP `inbox_list`'s
`threadUrl`) open `/app?artifact=<id>&comment=<commentId>`
(`src/lib/app-link.ts`). The artifact opens in the workspace, and
`useLinkedArrival` (`src/components/comments`) decides where the comment
shows (`linkedCommentTarget`, `src/lib/comments/link-target-rules.ts`): an
inline comment, or a reply to one, in its card at the words when they are
on the page; anything else (a comment on the whole artifact, a resolved
thread, words that changed) in the Comments dialog, scrolled to the comment
and briefly marked; a deleted comment as a quiet "This comment was deleted."
The link only names a comment: what shows comes from the thread the viewer
may load. The old thread page is gone; `src/proxy.ts` redirects
`/threads/<id>` to `/app?artifact=<id>&comments=1` for every id, and the
browser keeps an old link's `#comment-<id>` across the redirect, which the
workspace reads as the comment.

The UI takes its data through
a `ThreadApi` (`use-comment-thread.ts`), so `/dev/inline-comments`
(`?seed=1`, `?as=reader`) and `e2e/inline-comments.spec.ts` run without a
database; `inline-comments.db.test.ts` covers the server rules.

A mention also works in a document's own text (#254, the owner 2026-11-20:
"mentioning fellow team mates or agents (like \"@claude\")"): `@handle` in a
Markdown artifact is the same plain text a comment's mention is, so the
Markdown an agent reads agrees with the page. Every save of content
(`saveChanges` in `src/lib/artifacts.ts`, web and MCP; never a restore) runs
`notifyDocumentMentions` after its response
(`src/lib/comments/document-mentions.ts`, rules in
`document-mention-rules.ts`):

- Who can be reached is the comment rule (`mentionRefusal`) with the
  comments setting left out, and an agent's save notifies people only.
- A recipient is told once per artifact, by the first save that finds their
  handle in the text they are served, and again only when the handle is
  added anew after they read the earlier one. Anything else that changes
  who is served the text calls `notifyDocumentMentionsAfterSharing`:
  `setVisibility`, an approved sharing request (`approve`) and an approved
  edit (`applyDecision`), all in `src/lib/sharing/service.ts`. A new path
  that shares an artifact or moves its approved version calls it too.
- At most `MAX_MENTIONS_PER_SAVE` a save; the rest are told by a later save.
  A save looks up at most `MAX_DOCUMENT_HANDLES` handles that have nobody
  told yet, so only handles that reach nobody, or whose owner is not served
  the text yet, stay in that window.
- The stored row is a `mention` with no `comment_id` (one per artifact and
  recipient, `actor_id` the writer) and, for people, a `notification` of type
  `mention` with no comment. A deployment from before 0051 hides both: it
  reads mentions through the comment. Never give these rows a new type
  without checking what the previous deployment does with it.
- Rows hold ids only. The Inbox, the bell, and `inbox_list` read the block
  that names the reader from the text that reader is served
  (`document-mention-view.ts`), so a mention waiting in a version they are
  not served stays hidden, and one taken out of the text drops out.
- `document-mentions.db.test.ts` covers the rules against Postgres.
- The document editor offers the same `@` list as the comment box: the
  `CommentMentions` extension (`comment-mentions.tsx`), always in
  `rich-markdown-editor.tsx` and off until a `DocumentMentionsLoader`
  (`src/components/editor/document-mentions-context.tsx`) above it offers
  people for a saved Markdown artifact (`DocumentContent` in
  `inline-content.tsx`): the artifact page's editor (`edit-surface.tsx`),
  the workspace (`app/page.tsx`), and the `/dev/editor?mentions=` fixture.
  Without a loader or an id (other fixtures, a new artifact, a Markdown block
  in an interface) nothing is fetched and `@` is plain text.
  A pick writes plain `@handle` text, so the save path above is the only
  thing that notifies. The list is `documentMentionDirectory`
  (`mentionables.ts`): the save's own rule without "can read it", since a
  mention in a draft lands once it is shared; only someone who may edit the
  artifact gets it (`loadDocumentMentionablesAction`), once per open editor.
- The extension is always in the document editor and starts off
  (`startsOff`); `setMentionSource(null)` keeps `@` plain text. Never add it
  only when a page offers mentions, and never wrap the editor in something
  that appears only once the artifact has an id: a new artifact gets its id
  while it is being written, and either change remounts the editor and drops
  the text (`e2e/new-artifact.spec.ts` fails on it). `DocumentMentionsProvider`
  always renders, with a null id until there is one.
- The hint under an `@` claims "no one to mention" or "no match" only of a
  list that is here (`MentionListState`): one on its way says it is loading,
  and one that could not be loaded says so and is asked for again when the
  window next gets focus (never on a timer). A list loaded for one artifact
  is never offered on another.
- A list that arrives while an `@` is already being typed redraws the open
  menu (`refreshList` in the extension's storage): the suggestion plugin
  redraws only when the query changes.
- The artifact page's read view highlights the handles the text delivered
  (`readViewMentions`, one query, only when the latest Markdown has an `@`),
  drawn as the editor draws them (`DocumentMention` in `markdown-view.tsx`,
  no padding, no icon) so no word moves when the editor replaces the read
  view. An approved version's cached render stays plain: every reader
  outside the team shares it.

Agents mention over MCP by the same rules (the owner, 2026-11-20: "agents
cannot tag my team mates"). Both kinds failed the same way: a person's own
connection and an added agent had no way to learn a teammate's handle, so
they wrote a name (`@Ada`), and a mention on an artifact still private (an
agent's `visibility: "team"` waits for approval) was refused with words that
did not say why. What an agent gets now (`src/lib/mcp/mention-tools.ts`):

- `teams_list` lists each shared team's members (people and agents, without
  the caller, at most `MAX_TEAM_HANDLES`) with their handle, kind, and name
  (`src/lib/teams/team-handles.ts`, rules in `handle-rules.ts`). Only teams
  the caller is in, never an email, and the name labelled `untrustedText`:
  the same people every member reads on the team page. Never list members
  of a team the caller is not in, or anyone by an artifact alone.
- A refused comment mention says why in the web and over MCP alike
  (`refusalMessage`): `cannot_see` for the artifact's author or a teammate
  who cannot see the artifact or its comments yet ("share it with them,
  then mention them again"); `not_visible` for everything else, with one
  set of words for an unknown handle, a name, and someone outside the
  writer's teams, so the words never say which handles exist. Keep those
  two cases in one reason. MCP adds a `next` step (`toMcpMentions`).
- `artifacts_create` and `artifacts_update` (when the text or `visibility`
  changed) return `mentions` for a Markdown artifact whose text names a
  handle: `reaches`, `onceTheyCanRead`, `notNotified` with why
  (`documentMentionReport`, rules `documentMentionReach` beside the save's
  own). It decides and stores nothing; the delivery after the response does,
  and a failed report never fails the save's result.
- None of this changes who a mention reaches. `src/lib/mcp/agent-mentions.db.test.ts`
  runs every case through the real MCP server for both kinds of agent.

The comment box (`src/components/comments/comment-editor.tsx`, used for new
comments, replies, edits, and the cards at the text) is the rich Markdown
editor as a box: the same schema, round trip, Markdown paste, and menu over
selected text, with no slash menu, no media (`media={false}`), and no block
handles. A comment is still Markdown: a picked @mention is plain `@handle`
text (`mention-match.ts`, rules in `mention-autocomplete.ts`), so the server
reads mentions as before, and ⌘↵ or Ctrl+↵ posts from anywhere in the box,
code blocks included. Comments use the round trip's comment flavor
(`comment-markdown.ts`, escapes in `comment-text-markdown.ts`): text is
written as typed (`Q&A`, `snake_case`, `2 * 3`) and escaped only where it
would otherwise render differently. Every new or edited block is judged by
how the thread renders it (`thread-reading.ts`: MarkdownView's renderer and
syntax plugins, `markdown-syntax.ts`; compared in `comment-shape.ts`), and
written with every mark escaped when the light form reads differently; a
loaded block the box would show differently from the thread stays as
written. `comment-markdown-fuzz.test.tsx` checks awkward typed text against
the rendered HTML. A block holding `\@handle` or a named entity such as
`&copy;` loads as Markdown kept as written, so an edit never turns it into a
mention or into the entity's letters. Pasted Markdown links follow the
renderer's link rule (`src/lib/markdown/link-href.ts`): uploads stay links
in artifacts, never in comments. Artifacts keep the `"document"` flavor and
its full escaping. Its code loads only when a box nears the window
or takes focus (`useWantsEditor` in `comment-box.tsx`); until then, and for
good if the load fails, a plain textarea with the same name, size, and
shortcut stands in, and the rich box takes over its text and caret when it
arrives. The box never takes `data-comment-root`, and the composer carries
`data-comment-skip`, so inline comments never read it as document words.
Fixtures supply people to mention through `MentionablesLoader`;
`/dev/inline-comments` keeps every body it is sent in
`window.fixtureCommentWrites`.

Who a comment can mention follows who can read the artifact
(`listMentionables`): a private artifact's list is empty. The list
(`MentionablesProvider`) is loaded once per thread on the page, and the
artifact page's thread stays on the page across a sharing change, so a move
to a team once left "@" with nobody to offer until a reload. Every save of
sharing in the browser says so (`announceSharingChanged` in
`src/components/app/sharing-events.ts`: the Share dialog's save, and Undo
on the move toast), and the provider loads the list again, keeping the one
in hand until the new one arrives, and after a load that failed. A save
announces whatever its `status`: a move can apply while only opening its
comments waits, which also answers "pending", so never gate the
announcement on "applied". A new path in the browser that saves an
artifact's sharing or its comments setting announces it too. A change made
elsewhere (another tab, an approval, an agent) sends no signal: that list
is new after a reload. The comment box's hint under `@` says only what is
known (`MentionListState`): that the list is loading until the newest
request answers, that it could not be loaded when that request failed, and
that nobody can be mentioned only of a list that answered it; suggestions
in hand stay on screen meanwhile. The rule is one pure function,
`mentionListView` in `src/components/comments/mention-list-load.ts` (unit
tested), read by both `MentionablesProvider` and the document editor's
`DocumentMentionsProvider`: never a second copy of it. A failed load is
asked for again on the next window focus (`useRetryOnFocus`, shared the
same way), never on a timer. `e2e/artifact-page-share.spec.ts`
holds this on `/dev/artifact-share?mentions=1`, whose list follows the
fixture's sharing and whose requests a test can hold or fail
(`fixture:mentions-network`, `fixture-mentions-network.ts`), and
`e2e/comment-mentions-after-move-db.spec.ts` on the real page.
