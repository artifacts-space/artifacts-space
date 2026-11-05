import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Braces, Code2, FileText, LockKeyhole } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
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

const kindIcons = { markdown: FileText, code: Code2, text: FileText, json: Braces };

export default async function SharedArtifactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artifact = await getSharedArtifact(id);
  if (!artifact) notFound();
  const Icon = kindIcons[artifact.kind];

  return (
    <div className="min-h-screen bg-[#111216]">
      <header className="mx-auto flex h-20 max-w-5xl items-center justify-between border-b border-white/10 px-5">
        <Logo />
        <CopyButton value={artifact.content} label="Copy artifact" variant="secondary" className="h-8 text-xs" />
      </header>
      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <div className="mb-8 flex items-center gap-2 font-mono text-[9px] tracking-[0.14em] text-[#72a5ff]">
          <Icon className="size-3.5" /> SHARED ARTIFACT / {artifact.kind.toUpperCase()}
        </div>
        <h1 className="text-balance text-4xl font-medium leading-tight tracking-[-0.045em] sm:text-5xl">{artifact.title}</h1>
        {artifact.summary && <p className="mt-5 max-w-2xl text-[15px] leading-7 text-white/40">{artifact.summary}</p>}
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] text-white/25">
          {artifact.project && <span>PROJECT / {artifact.project}</span>}
          <span>UPDATED / {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(artifact.updatedAt)).toUpperCase()}</span>
          {artifact.source && <span>SOURCE / {artifact.source}</span>}
        </div>
        <article className="mt-10 overflow-hidden rounded-xl border border-white/10 bg-[#0e0f12]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <span className="font-mono text-[9px] text-white/25">READ ONLY</span>
            <LockKeyhole className="size-3 text-white/20" />
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words p-6 font-mono text-[12px] leading-7 text-white/65 sm:p-8">{artifact.content}</pre>
        </article>
        <div className="mt-12 flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <h2 className="text-2xl font-medium tracking-[-0.035em]">Keep context across your own sessions.</h2>
          <p className="mt-3 max-w-md text-[13px] leading-6 text-white/35">Create artifacts from any coding agent and find them again through one MCP server.</p>
          <Button render={<a href="/sign-up" />} className="mt-6 bg-white text-black hover:bg-white/85">Create your workspace</Button>
        </div>
      </main>
    </div>
  );
}
