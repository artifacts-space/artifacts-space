import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/logo";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import { getSharedArtifact } from "@/lib/artifacts";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const artifact = await getSharedArtifact(id);
  return { title: artifact?.title ?? "Artifact not found" };
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function SharedArtifactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artifact = await getSharedArtifact(id);
  if (!artifact) notFound();
  const Icon = kindIcons[artifact.kind];
  const meta = [
    artifact.project ? `Project ${artifact.project}` : null,
    `Updated ${dateFormat.format(new Date(artifact.updatedAt))}`,
    artifact.source ? `Source ${artifact.source}` : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between px-6">
        <Logo />
        <CopyButton value={artifact.content} label="Copy" variant="outline" size="sm" className="text-xs" />
      </header>
      <main className="mx-auto w-full max-w-[960px] px-6 py-12 sm:py-16">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`size-3.5 ${kindColors[artifact.kind]}`} /> Shared artifact · {artifact.kind}
        </div>
        <h1 className="mt-4 text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl">{artifact.title}</h1>
        {artifact.summary && <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">{artifact.summary}</p>}
        <p className="mt-4 text-[13px] text-muted-foreground">{meta.join(" · ")}</p>
        <article className="mt-10 overflow-hidden rounded-md border bg-card">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words p-6 font-mono text-[12.5px] leading-7 sm:p-8">{artifact.content}</pre>
        </article>
        <p className="mt-10 text-[13px] leading-6 text-muted-foreground">
          Shared from artifacts.space, a shared artifact hub for coding agents.{" "}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">Create your own workspace</Link>
        </p>
      </main>
    </div>
  );
}
