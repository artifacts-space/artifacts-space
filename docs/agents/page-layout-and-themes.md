# Page column, themes, and covers

Part of the agent and contributor guide, [AGENTS.md](../../AGENTS.md), whose
rules apply here too. Read this before you change the artifact page's layout, the /app pane, themes, team presets, or covers.

## Page column

An artifact has one column, and everything in it starts and ends at the
same place: the title, the summary, the chips and meta line, the notices,
the body, and the files under it (a Files artifact's section, or the list of
attached files; see Files in a document in `documents-and-media.md`). The column is the reading width: 1024px
with 24px side padding when contained, the whole window with Full width
(`src/lib/page-width/rules.ts`; change the width there, once). Never give a
part of the page its own narrower cap or its own side padding: a body that
stops short of where the title ends reads as a layout fault. Markdown and
plain text keep a 72ch cap only where no page column is around them (a
version in History); `bodyFillsColumnClass` lifts it inside the column, on
the artifact page and in the /app panes, and an interface's Text and List
blocks follow the same cap. Plain text has no frame of its own, for readers
or editors, and a comment's text fills its card.

In the /app pane the toolbar stays and everything under it is one page
that scrolls (`detailOuter` in `detail-scroll.ts`): the title block (icon,
title, summary, chips, meta line) scrolls away with the body, as on a
document page, and it sits on the body's surface in the artifact's theme
(`PaneHead` and `headSurface` in `pane-head.tsx`; the theme's page color
when themed, the card otherwise). Never pin the title block, and never
give it a surface of its own. Two things stay in view while the page
scrolls (`PinnedInPane`): a notice that arrives (someone else saved, an
agent saved, a catch-up), and the meta line while a save has not gone
through (`isSaveProblem`). Phones scroll the window, and nothing pins
there. Every row that holds the content's column, above the body and
inside it, leaves the block gutter on both sides (`gutterRoom`): one
variable, set by `detailOuterClass` from the artifact's kind alone, so the
title never moves when View source opens. A band that spans the pane (a
notice, the files under the body) takes the `column` class for its content.
Under View source the field's side padding is the column's. A new row
must keep to this. `e2e/title-body-column.spec.ts` (fixtures: the editor
in the pane and on the page, for Markdown, text, and interface artifacts),
`e2e/title-body-column-db.spec.ts` (a reader on the real page, and the
pane's read-only view), and `e2e/pane-header-column.spec.ts` measure both
edges at several window widths; `e2e/pane-head.spec.ts` checks that the
title block scrolls away, what stays, and the surface.

## Themes

Artifact themes live in `src/lib/themes` (tokens, validation, contrast,
presets, fonts) and render through `ThemeScope`
(`src/components/artifact-view/theme-scope.tsx`). Theme values reach the page
only as validated custom properties in a wrapper's `style`, never as a
`<style>` string. Preset colors live in `src/lib/themes/presets.ts`; the
Default preset must equal the tokens in `globals.css` (a test checks it).
Theme fonts other than Geist are vendored in `public/fonts/v1/<id>/` and load
only where a theme uses them; never add one to the root layout.

A scope's tokens reach only the elements inside its wrapper. Content that is
drawn elsewhere in the document (a dialog) reads the nearest scope's theme
from `ThemeSourceContext` (`theme-scope-context.ts`) and wraps itself in a
`ThemeScope` of its own, as the canvas board's full screen does.

Team presets and the team default live in `src/lib/themes/team-preset-rules.ts`
(pure rules), `team-presets.ts` (storage), and `artifact-theme-context.ts`
(what an artifact resolves against). Artifacts store a team preset as a live
reference, `team:<slug>`; the slug is unique across teams and never changes.
An artifact resolves its own theme, then the default of the shared team it is
shared through, then the site default, with `resolveThemeFor`; use it on every
surface that draws an artifact (page, history, link preview, Markdown). A
reference to another team's preset or a deleted one falls back; never copy a
preset into an artifact. Only owners and admins change presets and the default
(`src/app/(workspace)/teams/theme-actions.ts`); agents can only list and use them.

Team preset names and ids (`team:<slug>`, whose slug holds part of the name)
are team-internal, like projects and tags: only readers who may edit the
artifact (the author and its team) see them. Every surface an outsider can
reach goes through `src/lib/themes/theme-privacy.ts` (Markdown `- Theme:`,
the page's `data-artifact-theme`, `artifacts_get`), which shows "Custom"
instead and never says "team default". Link preview image URLs carry a short
hash of the resolved theme (`src/lib/og/theme-key.ts`), never a name, so a
team default or preset edit gives the card a fresh URL.

Every save of a team preset and every team default change writes a row in
`team_theme_revision` (`src/lib/themes/team-theme-revisions.ts`), newest 50
kept per preset and per default. Restore (owners and admins only) saves the
old state again as a new revision through the normal checks; never update or
re-date an old revision, and never file artifact versions from team settings.

A themed artifact's page also themes what is drawn outside its own element:
dialogs (History), menus, and popovers render in portals at the end of the
body, and toasts above every page, so they kept the site's colors on a
themed page (the owner, 2026-11-19, #262). `ArtifactPageTheme` with
`overlays` (the artifact page only) mounts `OverlayTheme`, which puts the
same color tokens and mode lock on the body while the page is shown
(`applyOverlayTheme`, `src/lib/themes/overlay-theme.ts`) and takes them off
when the theme changes or the page goes away. One per page: a second would
fight over the body, which is why the gallery's specimens do not set it. The
workspace's panes still theme the document alone.
`e2e/artifact-page-share.spec.ts` (`/dev/artifact-share?theme=ink`) checks a
dialog and a toast; `e2e/artifact-theme-overlays-db.spec.ts` the real page.

## Covers

Artifact covers live in `src/lib/covers` (gradients, parsing, reposition
rules) and render through `src/components/artifact-cover`. A cover is stored as
text: a gradient id, or `file:<uuid>` with an optional `@<0-100>` focal point.
Gradients are recipes over theme tokens (`color-mix` in OKLab into
`--background`), never literal colors, so they follow the theme and light or
dark; link previews redraw the same recipe as hex (`coverGradientHex`). Cover
images use the icon image rules (no SVG, uploads only) with a 2 MB cap and are
checked in `src/lib/files/cover-file.ts`. The web pickers prepare every cover
and icon image in the browser first (`src/components/images/prepare-image.ts`
with a profile from `src/lib/images/prepare-rules.ts`: upright, at most 2400 px
for covers and 512 px for icons, JPEG unless a transparent PNG fits, camera
data dropped); the server cap and type checks stay the authority. Link
previews can draw only PNG and JPEG covers; Satori draws nothing for WebP.

Uploaded icon and cover images are kept while the artifact or any version in
its history shows them, so Remove is undone by Restore. `icon-cleanup.ts`
deletes one only when it leaves every retained version (history pruning in
`versions/history.ts` hands it the dropped versions' images) or with the
artifact. Kept images never widen access: readers of the approved version get
only that version's icon and cover (`served-images.ts`, `canReadFile`).

The editors' controls sit on the picture (`editable-cover.tsx`), so their
surface is solid in both modes (`controlClass`): the outline button's own
dark surface is 30% opaque, and that or a blur makes the names unreadable
over a high-contrast image. A removed cover is gone at once; the page around
it was laid out by the server for a cover (no space above the heading, the
icon pulled up across the cover's edge), so `RemovedCoverSpace` holds the
difference until the server's page arrives: the title and everything under
it stay where they are when it does (with an icon, the icon alone settles a
few pixels, since its box over a cover is not its row without one). If the
heading's spacing or the icon's box changes in the artifact page, change
those heights with it (`e2e/artifact-cover.spec.ts` compares the positions,
with and without an icon).
