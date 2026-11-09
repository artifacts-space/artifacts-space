import { IconClock } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { TitleIcon } from "@/components/artifact-icon/title-icon";
import { TitleTheme } from "@/components/artifact-theme/title-theme";
import { AddCoverButton } from "@/components/artifact-cover/add-cover-button";
import { ArtifactCover } from "@/components/artifact-cover/artifact-cover";
import { ApprovedArticle } from "@/components/artifact-page/approved-article";
import { ArtifactHeader } from "@/components/artifact-page/artifact-header";
import { ArtifactPageFooter } from "@/components/artifact-page/artifact-page-footer";
import { ArtifactPageTheme } from "@/components/artifact-page/artifact-page-theme";
import { ArtifactHeaderMenu } from "@/components/artifact-page/artifact-header-menu";
import { EditorIsland } from "@/components/artifact-page/editor-island";
import { InlineBody, InlineSummary, InlineTitle } from "@/components/artifact-page/inline-fields";
import { PageConflictNotice, PageEditorChromeProvider } from "@/components/artifact-page/page-editor-chrome";
import { ReportDialog } from "@/components/artifact-page/report-dialog";
import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { SheetFill } from "@/components/artifact-view/sheet-fill";
import { ThemeBackdrop, ThemeScope } from "@/components/artifact-view/theme-scope";
import { PageOrganizers } from "@/components/projects/page-organizers";
import { CommentThread } from "@/components/comments/comment-thread";
import { HarnessByline } from "@/components/harness/harness-byline";
import { LastEdited } from "@/components/history/last-edited";
import { ViewBeacon } from "@/components/views/view-beacon";
import { getViewableArtifact, type ViewableArtifact } from "@/lib/access";
import { canSeeComments } from "@/lib/comments/setting-rules";
import { filesForViewer } from "@/lib/files/download";
import type { FileDto } from "@/lib/files/types";
import { accountCreatedAt } from "@/lib/account-age";
import { loadActor } from "@/lib/agents/queries";
import { loadArtifactByline } from "@/lib/artifact-byline";
import { iconTitlePrefix } from "@/lib/artifact-icons";
import type { ArtifactEditorDto } from "@/lib/artifact-types";
import { artifactOgMetadata, artifactPagePath } from "@/lib/og/artifact-og";
import { hasWidthSetting, pageColumnClass, readingMeasureClass, usesFullWidth } from "@/lib/page-width/rules";
import { pageOrganizersFor } from "@/lib/projects/page-project";
import { isReportable } from "@/lib/reports/rules";
import { isSearchIndexable, pageRobots, showsInSearch } from "@/lib/search/search-rules";
import { getSession } from "@/lib/session";
import { resolveThemeFor } from "@/lib/themes/artifact-theme-context";
import { themeIdForReader } from "@/lib/themes/theme-privacy";
import { noThemeChoices, type ThemeChoices } from "@/lib/themes/theme-choice-types";
import { artifactThemeChoices } from "@/lib/themes/theme-choices";
import { lockedMode } from "@/lib/themes/style";
import { cn } from "@/lib/utils";
import { isReviewedLevel } from "@/lib/versions/rules";
import { countsViews } from "@/lib/views/view-rules";
import { visibilityCopy, visibilitySentence, type VisibilityCopy } from "@/lib/visibility-copy";

export const instant = false;

const notFoundMetadata: Metadata = { title: "Artifact not found", robots: { index: false, follow: false } };

/** The artifact's public id and the signed-in viewer's id (null when signed out). */
async function readerOf(params: Promise<{ publicId: string }>) {
  const [{ publicId }, session] = await Promise.all([params, getSession()]);
  return { publicId, viewerId: session?.user.id ?? null };
}

/**
 * The artifact for this viewer. getViewableArtifact, the session, the team
 * row, the author, and the account age are deduplicated per request (React
 * cache), so the page and generateMetadata share one read of each.
 */
async function load(params: Promise<{ publicId: string }>) {
  const { publicId, viewerId } = await readerOf(params);
  return getViewableArtifact(publicId, viewerId);
}

/**
 * Whether search engines may index this page: public, someone who can share
 * it turned on "Show in search engines", and the author's account is past
 * its first days. A failed account lookup counts as a new account.
 */
async function indexable(record: ViewableArtifact["record"]) {
  if (!showsInSearch(record)) return false;
  const createdAt = await accountCreatedAt(record.userId).catch(() => null);
  return isSearchIndexable(record, createdAt);
}

/**
 * The tab title comes from the version this viewer reads. The description
 * and link-preview tags come only from what a signed-out reader sees (the
 * approved version of a link or public artifact, see artifactOgMetadata), so
 * an unapproved edit, or a private or team artifact, never reaches link
 * previews or search results; those pages keep the site's description.
 * A public page may be indexed (links not followed) only when its author
 * turned on "Show in search engines" and their account is a few days old;
 * every other page is noindex (src/lib/search/search-rules.ts). src/proxy.ts answers 404 before this runs when the viewer
 * cannot read the artifact.
 */
export async function generateMetadata({ params }: PageProps<"/artifact/[publicId]">): Promise<Metadata> {
  const { publicId, viewerId } = await readerOf(params);
  const viewable = await getViewableArtifact(publicId, viewerId);
  if (!viewable) return notFoundMetadata;
  const { record, view } = viewable;
  // The preview tags are what a signed-out reader gets, decided from the row this request already loaded.
  const [ogMetadata, searchIndexable] = await Promise.all([artifactOgMetadata(record.publicId, viewerId), indexable(record)]);
  return {
    ...ogMetadata,
    title: `${iconTitlePrefix(view.icon)}${view.title}`,
    // Agents that read HTML find the Markdown version here (src/lib/markdown).
    alternates: { canonical: artifactPagePath(record.publicId), types: { "text/markdown": `/artifact/${record.publicId}.md` } },
    robots: pageRobots(searchIndexable),
  };
}

/** Tells the author and team members that readers outside the team still see the approved version. */
function PendingEditNotice({ viewable }: { viewable: ViewableArtifact }) {
  if (!viewable.editPending) return null;
  return (
    <p role="status" className="mt-6 flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm leading-5 text-muted-foreground">
      <IconClock className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">Changes waiting for approval.</span> You see the latest version. Readers outside the team see the last approved version until a team owner or admin approves the changes.
      </span>
    </p>
  );
}

/** The artifact itself: the shared cached render for an approved version, or a fresh render of the latest. */
function ArtifactBody({ viewable, files }: { viewable: ViewableArtifact; files: FileDto[] }) {
  const { view, version } = viewable;
  if (version.versionId) return <ApprovedArticle versionId={version.versionId} savedAt={viewable.served.updatedAt.toISOString()} files={files} />;
  return <ArtifactView kind={view.kind} content={view.content} title={view.title} language={view.language} files={files} />;
}

/** Who saved the version this reader sees, or null when they are gone. Shares the byline's lookup when it is the author (loadActor). */
async function lastEditor(userId: string | null): Promise<ArtifactEditorDto | null> {
  if (!userId) return null;
  const actor = await loadActor(userId);
  return actor ? { id: userId, kind: actor.kind, handle: actor.handle, name: actor.name } : null;
}

/**
 * With a cover and an icon, the icon sits across the cover's lower edge, as
 * in Notion: this box is pulled up by half its height and the icon is
 * centred in it, whatever the icon's size. It is only as wide as what it
 * holds, so the cover's own controls at its bottom right stay clickable.
 */
const overCoverClass = "relative -mt-8 mb-2 flex h-16 w-fit items-end gap-1 sm:-mt-10 sm:h-20";

/** The editors' icon row: the icon (or Add icon), the theme, and Add cover while there is no cover. */
function EditorHeadingIcon({ viewable, themeChoices, overCover }: { viewable: ViewableArtifact; themeChoices: ThemeChoices; overCover: boolean }) {
  const { view, record } = viewable;
  const controlSpace = view.icon ? "mb-2" : "mb-1";
  return (
    <div data-page-icon={overCover ? "over-cover" : "in-flow"} className={overCover ? overCoverClass : "flex flex-wrap items-end gap-1"}>
      <TitleIcon key={view.icon ?? ""} publicId={record.publicId} icon={view.icon} className={overCover ? "mb-0 flex self-center" : ""} />
      <div className={controlSpace}>
        <TitleTheme key={JSON.stringify(view.theme)} publicId={record.publicId} theme={view.theme} choices={themeChoices} />
      </div>
      {view.cover ? null : <div className={controlSpace}><AddCoverButton publicId={record.publicId} /></div>}
    </div>
  );
}

/** The page icon above the title: the icon, theme, and Add cover controls for editors, the icon alone for readers. */
function HeadingIcon({ viewable, themeChoices }: { viewable: ViewableArtifact; themeChoices: ThemeChoices }) {
  const { view } = viewable;
  const overCover = Boolean(view.cover && view.icon);
  if (viewable.canEdit) return <EditorHeadingIcon viewable={viewable} themeChoices={themeChoices} overCover={overCover} />;
  if (!view.icon) return null;
  if (overCover) {
    return (
      <div data-page-icon="over-cover" className={overCoverClass}>
        <div className="flex self-center"><ArtifactIcon icon={view.icon} size="page" /></div>
      </div>
    );
  }
  return <div data-page-icon="in-flow" className="mb-2"><ArtifactIcon icon={view.icon} size="page" /></div>;
}

/**
 * The summary as readers see it. For editors an empty summary keeps the
 * height of the field it becomes ("Add a one-line summary"), so nothing
 * below moves when editing unlocks.
 */
function SummaryReadView({ summary, editable }: { summary: string; editable: boolean }) {
  if (summary) return <p className="mt-4 max-w-2xl text-md leading-7 text-muted-foreground">{summary}</p>;
  return editable ? <div aria-hidden data-summary-space="" className="mt-4 h-7" /> : null;
}

/**
 * Icon, title, summary, the project (for editors only), who saved it last,
 * and whether changes wait for approval. For editors the title and summary
 * are fields in the same place (inline-fields.tsx). Who can see it is the
 * header's visibility badge, so the heading does not repeat it.
 */
function ArtifactHeading({ viewable, editor, organizers, themeChoices }: { viewable: ViewableArtifact; editor: ArtifactEditorDto | null; organizers: React.ReactNode; themeChoices: ThemeChoices }) {
  const { view } = viewable;
  // Who made it: the agent harness of the version this reader is served (anyone who can read it may see it), else the source the agent gave.
  // A detected unknown client says less than the source it gave, so the source wins over "via another agent"; a chosen "Other agent" still shows.
  const served = viewable.served.harness;
  const harness = served?.id === "other" && !served.overridden && view.source ? null : (served?.id ?? null);
  const meta = [!harness && view.source ? `Source ${view.source}` : null].filter(Boolean);
  return (
    <>
      <div className="group/title">
        <HeadingIcon viewable={viewable} themeChoices={themeChoices} />
        <InlineTitle>{view.title}</InlineTitle>
      </div>
      <InlineSummary><SummaryReadView summary={view.summary} editable={viewable.canEdit} /></InlineSummary>
      {organizers}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <LastEdited editor={editor} at={view.updatedAt.toISOString()} className="text-sm" />
        <HarnessByline harness={harness} />
        {meta.length > 0 ? <span>· {meta.join(" · ")}</span> : null}
      </div>
      <PendingEditNotice viewable={viewable} />
    </>
  );
}

/**
 * The project and tag controls, only for those who may edit the artifact: its author
 * and members of the team it is shared through. Everyone else, including
 * every reader of a link or public page, never receives the project.
 */
async function loadOrganizers(viewable: ViewableArtifact, session: { user: { id: string } } | null) {
  const values = await pageOrganizersFor(viewable, session ? session.user.id : null).catch(() => undefined);
  if (values === undefined) return null;
  return <PageOrganizers artifactId={viewable.record.id} project={values.project} tags={values.tags} />;
}

/** The team presets and team default the theme picker offers, only for editors (who belong to the team). */
async function loadThemeChoices(viewable: ViewableArtifact, viewerId: string | null): Promise<ThemeChoices> {
  if (!viewable.canEdit || !viewerId) return noThemeChoices;
  return artifactThemeChoices(viewerId, viewable.record).catch((error: unknown) => {
    console.error("[themes] Theme choices failed", error instanceof Error ? error.name : "unknown error");
    return noThemeChoices;
  });
}

/**
 * Whether this signed-in reader gets the comment section. With comments off,
 * or for readers outside the team when they are team-only, the page has no
 * comment section at all.
 */
function seesComments(viewable: ViewableArtifact, viewerId: string) {
  const { record } = viewable;
  return canSeeComments(record.comments, { canViewArtifact: true, isAuthor: record.userId === viewerId, isTeamMember: viewable.isTeamMember });
}

/** Under the artifact: the sign-up line for readers outside the workspace, and Report for link and public artifacts. */
function SignUpAndReport({ copy, publicId, visibility }: { copy: VisibilityCopy; publicId: string; visibility: ViewableArtifact["record"]["visibility"] }) {
  const reportable = isReportable(visibility);
  if (!copy.showSignUp && !reportable) return null;
  return (
    <div className="mt-10 flex flex-wrap items-baseline justify-between gap-4 text-sm leading-6 text-muted-foreground">
      {copy.showSignUp ? (
        <p>
          Shared from artifacts.space, a shared artifact hub for coding agents.{" "}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">Create your own workspace</Link>
        </p>
      ) : null}
      {reportable ? <ReportDialog publicId={publicId} /> : null}
    </div>
  );
}

/**
 * The read view of the body. For editors of a Markdown or Text artifact it
 * takes the room the document editor will (at least half the window, the
 * rich editor's space under the text, and its format bar on touch screens),
 * so nothing below moves when editing unlocks.
 */
function BodyReadView({ viewable, files }: { viewable: ViewableArtifact; files: FileDto[] }) {
  const body = <ArtifactBody viewable={viewable} files={files} />;
  if (!viewable.canEdit) return body;
  if (viewable.view.kind === "markdown") return <div data-editor-space="" className="pointer-coarse:pt-12"><div className="min-h-[50dvh] pb-24">{body}</div></div>;
  if (viewable.view.kind === "text") return <div data-editor-space="" className="min-h-[50dvh]">{body}</div>;
  return body;
}

/** The space above the heading: less under a cover, and none when the icon sits across the cover's edge (HeadingIcon pulls it up). */
function mainTopClass(view: ViewableArtifact["view"]) {
  if (!view.cover) return null;
  return view.icon ? "pt-0 sm:pt-0" : "pt-8 sm:pt-10";
}

export default async function ArtifactPage({ params }: PageProps<"/artifact/[publicId]">) {
  const viewable = await load(params);
  if (!viewable) notFound();
  const { record, view } = viewable;
  // getSession is deduplicated per request, so these reuse load()'s lookup.
  const [byline, files, session, editor, organizers, resolved, themeChoices] = await Promise.all([
    loadArtifactByline(record, viewable.isTeamMember),
    filesForViewer(viewable),
    getSession(),
    lastEditor(view.editedBy),
    getSession().then((session) => loadOrganizers(viewable, session)),
    // The artifact's own theme, then its team's default, then the site default: the same for every reader.
    resolveThemeFor(record, view.theme),
    getSession().then((session) => loadThemeChoices(viewable, session?.user.id ?? null)),
  ]);
  const copy = visibilityCopy(record.visibility);
  const { theme, presetId, source } = resolved;
  // Full width is a display setting on the row, not part of a version: every reader sees the current choice. A CSV is always full width.
  const fullWidth = usesFullWidth(view.kind, record.fullWidth);
  const column = pageColumnClass(fullWidth);

  return (
    // The header, comments, and footer wear the artifact theme's colors (none for an unthemed artifact) and swap with it.
    <ArtifactPageTheme theme={theme} className="min-h-screen">
      {/* For editors, the in-place editor below publishes its save status and More menu to the header above it. */}
      <PageEditorChromeProvider>
        <StickyChrome>
          <ArtifactHeader
            column={column}
            visibility={record.visibility}
            sentence={visibilitySentence(copy, byline)}
            content={view.content}
            menu={viewable.canEdit ? <ArtifactHeaderMenu theme={theme} widthSetting={hasWidthSetting(view.kind)} waiting={{ publicId: record.publicId, title: record.title, updatedAt: record.updatedAt.toISOString(), reviewed: isReviewedLevel(record.visibility), fullWidth: record.fullWidth, files }} /> : null}
          />
        </StickyChrome>
        {/* A theme that locks light or dark sets that mode on the backdrop too, so comments and controls on it stay readable. */}
        <ThemeBackdrop theme={theme} className={cn("text-foreground", lockedMode(theme))}>
          {view.cover ? (
            <ThemeScope theme={theme}>
              <ArtifactCover publicId={record.publicId} cover={view.cover} editable={viewable.canEdit} fullWidth={fullWidth} />
            </ThemeScope>
          ) : null}
          <main className={cn("mx-auto w-full py-12 sm:py-16", column, mainTopClass(view))} data-full-width={fullWidth}>
            {/* The reading measure covers the artifact and its in-place editor, not the comments under it. */}
            <div className={readingMeasureClass(fullWidth)}>
              <EditorIsland viewable={viewable} viewerId={session?.user.id ?? ""} files={files}>
                <ThemeScope theme={theme} className="text-foreground" data-artifact-theme={themeIdForReader(presetId, viewable.canEdit)} data-theme-source={source}>
                  <ArtifactHeading viewable={viewable} editor={editor} organizers={organizers} themeChoices={themeChoices} />
                  <PageConflictNotice />
                  <article className="mt-10">
                    {/* A CSV's grid fills the window under the header, as a sheet does. */}
                    <SheetFill>
                      <InlineBody>
                        <BodyReadView viewable={viewable} files={files} />
                      </InlineBody>
                    </SheetFill>
                  </article>
                </ThemeScope>
              </EditorIsland>
            </div>
            <SignUpAndReport copy={copy} publicId={record.publicId} visibility={record.visibility} />
            {/* Comments are for signed-in readers the comments setting lets in; the thread checks access itself too. */}
            {session && seesComments(viewable, session.user.id) ? <CommentThread publicId={record.publicId} className="mt-12 border-t pt-8" raised /> : null}
          </main>
        </ThemeBackdrop>
      </PageEditorChromeProvider>
      {/* Cookieless view count for the author; people who can edit are never counted (the server checks too). */}
      {countsViews(record.visibility) && !viewable.canEdit ? <ViewBeacon publicId={record.publicId} /> : null}
      <ArtifactPageFooter column={column} />
    </ArtifactPageTheme>
  );
}
