"use client";

import {
  Braces,
  Code2,
  FileText,
  Folder,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ArtifactEditor } from "@/components/app/artifact-editor";
import { CreateArtifactDialog } from "@/components/app/create-artifact-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ArtifactDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

const kindIcons = { markdown: FileText, code: Code2, text: FileText, json: Braces };

export function Dashboard({
  initialArtifacts,
  origin,
}: {
  initialArtifacts: ArtifactDto[];
  origin: string;
}) {
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [selectedId, setSelectedId] = useState(initialArtifacts[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return artifacts.filter((artifact) => {
      const matchesKind = kind === "all" || artifact.kind === kind;
      const matchesQuery =
        !search ||
        [artifact.title, artifact.summary, artifact.content, artifact.project, artifact.source]
          .join(" ")
          .toLowerCase()
          .includes(search);
      return matchesKind && matchesQuery;
    });
  }, [artifacts, kind, query]);

  const selected = artifacts.find((artifact) => artifact.id === selectedId) ?? filtered[0] ?? null;
  const projects = new Set(artifacts.map((artifact) => artifact.project).filter(Boolean));

  function created(artifact: ArtifactDto) {
    setArtifacts((current) => [artifact, ...current]);
    setSelectedId(artifact.id);
    setQuery("");
    setKind("all");
  }

  function updated(artifact: ArtifactDto) {
    setArtifacts((current) => current.map((item) => (item.id === artifact.id ? artifact : item)));
  }

  function deleted(id: string) {
    setArtifacts((current) => {
      const next = current.filter((artifact) => artifact.id !== id);
      setSelectedId(next[0]?.id ?? "");
      return next;
    });
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1600px] flex-col p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[9px] tracking-[0.14em] text-[#72a5ff]">YOUR SHARED CONTEXT</div>
          <h1 className="text-3xl font-medium tracking-[-0.04em]">Artifacts</h1>
          <p className="mt-2 text-[12px] text-white/35">
            {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"} · {projects.size} {projects.size === 1 ? "project" : "projects"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-9 bg-[#1768ff] px-3.5 text-xs text-white hover:bg-[#2f76ff]">
          <Plus /> New artifact
        </Button>
      </div>

      <div className="grid min-h-[680px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#14151a] shadow-[0_25px_80px_-40px_rgba(0,0,0,0.7)] lg:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-white/10 bg-white/[0.012] max-lg:max-h-[360px] lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b border-white/10 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/25" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your context…"
                className="h-9 border-white/[0.08] bg-black/15 pl-9 text-xs placeholder:text-white/25"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 px-1 text-[10px] text-white/35"><Folder className="size-3" /> All artifacts</div>
              <Select value={kind} onValueChange={(value) => setKind(value ?? "all")}>
                <SelectTrigger size="sm" className="h-7 border-0 bg-transparent px-1.5 text-[10px] text-white/35">
                  <SlidersHorizontal className="size-3" /><SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#1b1c22]">
                  <SelectItem value="all" className="text-xs">All formats</SelectItem>
                  {["markdown", "code", "text", "json"].map((value) => <SelectItem key={value} value={value} className="text-xs">{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Search className="mx-auto size-4 text-white/20" />
                <p className="mt-3 text-xs text-white/35">No matching artifacts.</p>
                <button type="button" onClick={() => { setQuery(""); setKind("all"); }} className="mt-2 text-[10px] text-[#72a5ff] hover:underline">Clear filters</button>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((artifact) => {
                  const Icon = kindIcons[artifact.kind];
                  const active = selected?.id === artifact.id;
                  return (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => setSelectedId(artifact.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-[#3980ff]/20 bg-[#1768ff]/[0.09]"
                          : "border-transparent hover:bg-white/[0.035]",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", active ? "text-[#72a5ff]" : "text-white/30")} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className={cn("truncate text-[11px] font-medium", active ? "text-white/85" : "text-white/60")}>{artifact.title}</h2>
                            {artifact.visibility === "unlisted" && <span className="size-1 shrink-0 rounded-full bg-[#4d8dff]" title="Shared" />}
                          </div>
                          <p className="mt-1.5 line-clamp-1 text-[10px] text-white/25">{artifact.summary || artifact.content}</p>
                          <div className="mt-2 flex items-center justify-between font-mono text-[8px] text-white/20">
                            <span className="truncate">{artifact.project || "NO PROJECT"}</span>
                            <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(artifact.updatedAt)).toUpperCase()}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border-t border-white/10 px-4 py-3 font-mono text-[8px] tracking-[0.08em] text-white/20">
            {filtered.length} VISIBLE · SYNCED WITH MCP
          </div>
        </aside>

        {selected ? (
          <ArtifactEditor key={selected.id} artifact={selected} origin={origin} onUpdated={updated} onDeleted={deleted} />
        ) : (
          <div className="dot-grid flex flex-1 items-center justify-center p-8">
            <div className="max-w-sm text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-[#3980ff]/20 bg-[#1768ff]/[0.08]">
                <FileText className="size-5 text-[#72a5ff]" />
              </div>
              <h2 className="mt-6 text-2xl font-medium tracking-[-0.035em]">Start with one useful thing.</h2>
              <p className="mt-3 text-[13px] leading-6 text-white/35">Save a decision, plan, or snippet. Your next coding session can pick it up through MCP.</p>
              <Button onClick={() => setCreateOpen(true)} className="mt-6 bg-[#1768ff] text-white hover:bg-[#2f76ff]"><Plus /> Create your first artifact</Button>
            </div>
          </div>
        )}
      </div>

      <CreateArtifactDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={created} />
    </main>
  );
}
