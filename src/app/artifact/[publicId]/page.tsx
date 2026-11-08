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
import { EditorIsland } from "@/components/artifact-page/editor-island";
import { ReportDialog } from "@/components/artifact-page/report-dialog";
import { StickyChrome } from "@/components/artifact-page/sticky-chrome";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { ThemeBackdrop, ThemeScope } from "@/components/artifact-view/theme-scope";
import { PageOrganizers } from "@/components/projects/page-organizers";
import { CommentThread } from "@/components/comments/comment-thread";
import { CopyButton } from "@/components/copy-button";
import { GitHubLink } from "@/components/github-link";
import { LastEdited } from "@/components/history/last-edited";
import { LegalLinks } from "@/components/legal-links";
import { Logo } from "@/components/logo";
import { PixelAvatar, type AvatarKind } from "@/components/pixel-avatar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ViewBeacon } from "@/components/views/view-beacon";
import { getViewableArtifact, type ViewableArtifact } from "@/lib/access";
import { canSeeComments } from "@/lib/comments/setting-rules";
import { filesForViewer } from "@/lib/files/download";
import type { FileDto } from "@/lib/files/types";
import { accountCreatedAt } from "@/lib/account-age";
import { loadArtifactByline } from "@/lib/artifact-byline";
import { iconTitlePrefix } from "@/lib/artifact-icons";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import type { ArtifactEditorDto } from "@/lib/artifact-types";
import { lastEditorsFor } from "@/lib/artifacts";
import { artifactOgMetadata, artifactPagePath } from "@/lib/og/artifact-og";
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
import { countsViews } from "@/lib/views/view-rules";
import { visibilityCopy, type VisibilityCopy } from "@/lib/visibility-copy";

export const instant = false;

const notFoundMetadata: Metadata = { title: "Artifact not found", robots: { index: false, follow: false } };

async function load(params: Promise<{ publicId: string }>) {
  const [{ publicId }, session] = await Promise.all([params, getSession()]);
  return getViewableArtifact(publicId, session?.user.id ?? null);
}

/**
 * Whether search engines may index this page: public, its author turned on
 * "Show in search engines", and the author's account is past its first days.
 * A failed account lookup counts as a new account.
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
  const viewable = await load(params);
  if (!viewable) return notFoundMetadata;
  const { record, view } = viewable;
  return {
    ...(await artifactOgMetadata(record.publicId)),
    title: `${iconTitlePrefix(view.icon)}${view.title}`,
    // Agents that read HTML find the Markdown version here (src/lib/markdown).
    alternates: { canonical: artifactPagePath(record.publicId), types: { "text/markdown": `/artifact/${record.publicId}.md` } },
    robots: pageRobots(await indexable(record)),
  };
}

interface NoticeProps {
  copy: VisibilityCopy;
  author: string;
  avatar: { seed: string; kind: AvatarKind } | null;
  teamName: string | null;
}

/** The note above every artifact: who can see it, and who shared it when that is not the reader. */
function VisibilityNotice({ copy, author, avatar, teamName }: NoticeProps) {
  return (
    <div role="note" className="border-b bg-muted/50">
      <p className="mx-auto w-full max-w-[960px] px-6 py-2 text-sm leading-5 text-muted-foreground">
        {copy.showAuthor ? (
          <>
            Shared by {avatar ? <PixelAvatar seed={avatar.seed} kind={avatar.kind} size={16} className="mr-1 -mt-px" /> : null}
            <span className="font-medium text-foreground">{author}</span>
            {teamName ? <> in <span className="font-medium text-foreground">{teamName}</span></> : null}.{" "}
          </>
        ) : null}
        {copy.note}
      </p>
    </div>
  );
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

/** Who saved the version this reader sees, or null when they are gone. */
async function lastEditor(userId: string | null): Promise<ArtifactEditorDto | null> {
  if (!userId) return null;
  return (await lastEditorsFor([{ updatedBy: userId }])).get(userId) ?? null;
}

/** The page icon above the title: the icon, theme, and Add cover controls for editors, the icon alone for readers. */
function HeadingIcon({ viewable, themeChoices }: { viewable: ViewableArtifact; themeChoices: ThemeChoices }) {
  const { view, record } = viewable;
  if (viewable.canEdit) {
    return (
      <div className="flex flex-wrap items-end gap-1">
        <TitleIcon key={view.icon ?? ""} publicId={record.publicId} icon={view.icon} />
        <div className={view.icon ? "mb-2" : "mb-1"}>
          <TitleTheme key={JSON.stringify(view.theme)} publicId={record.publicId} theme={view.theme} choices={themeChoices} />
        </div>
        {view.cover ? null : <div className={view.icon ? "mb-2" : "mb-1"}><AddCoverButton publicId={record.publicId} /></div>}
      </div>
    );
  }
  if (!view.icon) return null;
  return <div className="mb-2"><ArtifactIcon icon={view.icon} size="page" /></div>;
}

/**
 * Format, icon, title, summary, the project (for editors only), who saved it
 * last, and whether changes wait for approval.
 */
function ArtifactHeading({ viewable, editor, organizers, themeChoices }: { viewable: ViewableArtifact; editor: ArtifactEditorDto | null; organizers: React.ReactNode; themeChoices: ThemeChoices }) {
  const { view, record } = viewable;
  const Icon = kindIcons[view.kind];
  const meta = [view.source ? `Source ${view.source}` : null].filter(Boolean);
  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${kindColors[view.kind]}`} /> {visibilityCopy(record.visibility).kicker} · {view.kind}
      </div>
      <div className="group/title mt-4">
        <HeadingIcon viewable={viewable} themeChoices={themeChoices} />
        <h1 className="text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl">{view.title}</h1>
      </div>
      {view.summary ? <p className="mt-4 max-w-2xl text-md leading-7 text-muted-foreground">{view.summary}</p> : null}
      {organizers}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <LastEdited editor={editor} at={view.updatedAt.toISOString()} className="text-sm" />
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

  return (
    <div className="min-h-screen">
      <StickyChrome>
        <header className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <GitHubLink />
            <CopyButton value={view.content} label="Copy" variant="outline" size="sm" />
          </div>
        </header>
        <VisibilityNotice copy={copy} author={byline.author} avatar={byline.avatar} teamName={byline.teamName} />
      </StickyChrome>
      {/* A theme that locks light or dark sets that mode on the backdrop too, so comments and controls on it stay readable. */}
      <ThemeBackdrop theme={theme} className={cn("text-foreground", lockedMode(theme))}>
        {view.cover ? (
          <ThemeScope theme={theme}>
            <ArtifactCover publicId={record.publicId} cover={view.cover} editable={viewable.canEdit} />
          </ThemeScope>
        ) : null}
        <main className={cn("mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16", view.cover && "pt-8 sm:pt-10")}>
          <EditorIsland viewable={viewable} viewerId={session?.user.id ?? ""} files={files}>
            <ThemeScope theme={theme} className="text-foreground" data-artifact-theme={themeIdForReader(presetId, viewable.canEdit)} data-theme-source={source}>
              <ArtifactHeading viewable={viewable} editor={editor} organizers={organizers} themeChoices={themeChoices} />
              <article className="mt-10">
                <ArtifactBody viewable={viewable} files={files} />
              </article>
            </ThemeScope>
          </EditorIsland>
          <SignUpAndReport copy={copy} publicId={record.publicId} visibility={record.visibility} />
          {/* Comments are for signed-in readers the comments setting lets in; the thread checks access itself too. */}
          {session && seesComments(viewable, session.user.id) ? <CommentThread publicId={record.publicId} className="mt-12 border-t pt-8" raised /> : null}
        </main>
      </ThemeBackdrop>
      {/* Cookieless view count for the author; people who can edit are never counted (the server checks too). */}
      {countsViews(record.visibility) && !viewable.canEdit ? <ViewBeacon publicId={record.publicId} /> : null}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/" className="transition-colors hover:text-foreground">artifacts.space</Link>
            <LegalLinks />
          </div>
          <ThemeSwitcher />
        </div>
      </footer>
    </div>
  );
}
