import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/logo";
import { getViewableArtifact } from "@/lib/access";
import { isIndexable } from "@/lib/access-rules";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import { loadArtifactByline } from "@/lib/artifact-byline";
import { getSession } from "@/lib/session";

export const instant = false;

const notFoundMetadata: Metadata = { title: "Artifact not found", robots: { index: false, follow: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

async function load(params: Promise<{ publicId: string }>) {
  const [{ publicId }, session] = await Promise.all([params, getSession()]);
  return getViewableArtifact(publicId, session?.user.id ?? null);
}

export async function generateMetadata({ params }: PageProps<"/artifact/[publicId]">): Promise<Metadata> {
  const viewable = await load(params);
  if (!viewable) return notFoundMetadata;
  const { record } = viewable;
  return {
    title: record.title,
    ...(record.summary ? { description: record.summary } : {}),
    // Only public artifacts may be indexed. Link-only, team, and private pages never are.
    robots: isIndexable(record.visibility) ? { index: true, follow: false } : { index: false, follow: false },
  };
}

/** The label above every shared artifact, so readers know who wrote it. */
function UserContentNotice({ author, teamName }: { author: string; teamName: string | null }) {
  return (
    <div role="note" className="border-b bg-muted/50">
      <p className="mx-auto w-full max-w-[960px] px-6 py-2 text-xs leading-5 text-muted-foreground">
        Shared by <span className="font-medium text-foreground">{author}</span>
        {teamName ? <> in <span className="font-medium text-foreground">{teamName}</span></> : null}. This is user-shared content; artifacts.space does not review it.
      </p>
    </div>
  );
}

export default async function ArtifactPage({ params }: PageProps<"/artifact/[publicId]">) {
  const viewable = await load(params);
  if (!viewable) notFound();
  const { record } = viewable;
  const byline = await loadArtifactByline(record, viewable.isTeamMember);
  const Icon = kindIcons[record.kind];
  const meta = [
    record.project ? `Project ${record.project}` : null,
    `Updated ${dateFormat.format(record.updatedAt)}`,
    record.source ? `Source ${record.source}` : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between px-6">
        <Logo />
        <CopyButton value={record.content} label="Copy" variant="outline" size="sm" className="text-xs" />
      </header>
      <UserContentNotice author={byline.author} teamName={byline.teamName} />
      <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`size-3.5 ${kindColors[record.kind]}`} /> Shared artifact · {record.kind}
        </div>
        <h1 className="mt-4 text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl">{record.title}</h1>
        {record.summary ? <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">{record.summary}</p> : null}
        <p className="mt-4 text-[13px] text-muted-foreground">{meta.join(" · ")}</p>
        <article className="mt-10 overflow-hidden rounded-md border bg-card">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words p-6 font-mono text-[12.5px] leading-7 sm:p-8">{record.content}</pre>
        </article>
        <p className="mt-10 text-[13px] leading-6 text-muted-foreground">
          Shared from artifacts.space, a shared artifact hub for coding agents.{" "}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">Create your own workspace</Link>
        </p>
      </main>
    </div>
  );
}
