import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CommentThread } from "@/components/comments/comment-thread";
import { MarkThreadRead } from "@/components/comments/mark-thread-read";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Button } from "@/components/ui/button";
import { getViewableArtifact } from "@/lib/access";
import { loadArtifactByline } from "@/lib/artifact-byline";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Thread", robots: { index: false, follow: false } };
export const instant = false;

/** One artifact's comment thread, where inbox links and mention emails land. */
export default async function ThreadPage({ params }: PageProps<"/threads/[publicId]">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { publicId } = await params;
  const viewable = await getViewableArtifact(publicId, session.user.id);
  if (!viewable) notFound();
  const byline = await loadArtifactByline(viewable.record, viewable.isTeamMember);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" nativeButton={false} render={<Link href="/inbox" />}>
        <IconArrowLeft /> Inbox
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-medium tracking-[-0.01em] break-words">{viewable.view.title}</h1>
          <p className="mt-1 text-md text-muted-foreground">
            By {byline.avatar ? <PixelAvatar seed={byline.avatar.seed} kind={byline.avatar.kind} size={16} className="mr-1 -mt-px" /> : null}
            {byline.author}{byline.teamName ? ` · ${byline.teamName}` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/artifact/${viewable.record.publicId}`} />}>
          <IconExternalLink /> Open artifact
        </Button>
      </div>
      <div className="rounded-md border bg-card p-5">
        <CommentThread publicId={viewable.record.publicId} />
      </div>
      <MarkThreadRead publicId={viewable.record.publicId} />
    </main>
  );
}
