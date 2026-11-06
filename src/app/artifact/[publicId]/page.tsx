import { IconClock } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportDialog } from "@/components/artifact-page/report-dialog";
import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { CommentThread } from "@/components/comments/comment-thread";
import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/logo";
import { PixelAvatar, type AvatarKind } from "@/components/pixel-avatar";
import { getViewableArtifact, type ViewableArtifact } from "@/lib/access";
import { filesForViewer } from "@/lib/files/download";
import { isIndexable } from "@/lib/access-rules";
import { loadArtifactByline } from "@/lib/artifact-byline";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import { isReportable } from "@/lib/reports/rules";
import { getSession } from "@/lib/session";
import { visibilityCopy, type VisibilityCopy } from "@/lib/visibility-copy";

export const instant = false;

const notFoundMetadata: Metadata = { title: "Artifact not found", robots: { index: false, follow: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

async function load(params: Promise<{ publicId: string }>) {
  const [{ publicId }, session] = await Promise.all([params, getSession()]);
  return getViewableArtifact(publicId, session?.user.id ?? null);
}

/**
 * Metadata comes from the version this viewer reads, so an unapproved edit
 * never reaches link previews or search results. Public pages may be indexed
 * (links not followed); link, team, and private pages never are. src/proxy.ts
 * answers 404 before this runs when the viewer cannot read the artifact.
 */
export async function generateMetadata({ params }: PageProps<"/artifact/[publicId]">): Promise<Metadata> {
  const viewable = await load(params);
  if (!viewable) return notFoundMetadata;
  const { record, view } = viewable;
  return {
    title: view.title,
    ...(view.summary ? { description: view.summary } : {}),
    robots: isIndexable(record.visibility) ? { index: true, follow: false } : { index: false, follow: false },
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

export default async function ArtifactPage({ params }: PageProps<"/artifact/[publicId]">) {
  const viewable = await load(params);
  if (!viewable) notFound();
  const { record, view } = viewable;
  // getSession is deduplicated per request, so this reuses load()'s lookup.
  const [byline, files, session] = await Promise.all([loadArtifactByline(record, viewable.isTeamMember), filesForViewer(viewable), getSession()]);
  const Icon = kindIcons[view.kind];
  const copy = visibilityCopy(record.visibility);
  const reportable = isReportable(record.visibility);
  const meta = [
    view.project ? `Project ${view.project}` : null,
    `Updated ${dateFormat.format(view.updatedAt)}`,
    view.source ? `Source ${view.source}` : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between px-6">
        <Logo />
        <CopyButton value={view.content} label="Copy" variant="outline" size="sm" />
      </header>
      <VisibilityNotice copy={copy} author={byline.author} avatar={byline.avatar} teamName={byline.teamName} />
      <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`size-3.5 ${kindColors[view.kind]}`} /> {copy.kicker} · {view.kind}
        </div>
        <h1 className="mt-4 text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl">{view.title}</h1>
        {view.summary ? <p className="mt-4 max-w-2xl text-md leading-7 text-muted-foreground">{view.summary}</p> : null}
        <p className="mt-4 text-sm text-muted-foreground">{meta.join(" · ")}</p>
        <PendingEditNotice viewable={viewable} />
        <article className="mt-10">
          <ArtifactView kind={view.kind} content={view.content} title={view.title} language={view.language} files={files} />
        </article>
        {copy.showSignUp || reportable ? (
          <div className="mt-10 flex flex-wrap items-baseline justify-between gap-4 text-sm leading-6 text-muted-foreground">
            {copy.showSignUp ? (
              <p>
                Shared from artifacts.space, a shared artifact hub for coding agents.{" "}
                <Link href="/sign-up" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">Create your own workspace</Link>
              </p>
            ) : null}
            {reportable ? <ReportDialog publicId={record.publicId} /> : null}
          </div>
        ) : null}
        {/* Comments are for signed-in readers who can view the artifact; the thread checks access itself. */}
        {session ? <CommentThread publicId={record.publicId} className="mt-12 border-t pt-8" /> : null}
      </main>
    </div>
  );
}
