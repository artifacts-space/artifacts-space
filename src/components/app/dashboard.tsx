"use client";

import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { ArtifactEditor } from "@/components/app/artifact-editor/artifact-editor";
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
import { kindColors, kindIcons, kinds } from "@/lib/artifact-kinds";
import type { ArtifactDto } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-none flex-col p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-[-0.01em]">Artifacts</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"} across {projects.size} {projects.size === 1 ? "project" : "projects"}
          </p>
        </div>
        <Button onClick={() => { setCreateOpen(true); }} className="px-3">
          <IconPlus /> New artifact
        </Button>
      </div>

      <div className="grid min-h-[640px] flex-1 overflow-hidden rounded-md border bg-card lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b bg-background/60 max-lg:max-h-[360px] lg:border-r lg:border-b-0">
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <IconSearch className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => { setQuery(event.target.value); }}
                placeholder="Search"
                aria-label="Search artifacts"
                className="h-8 bg-card pl-8 text-[13px]"
              />
            </div>
            <Select value={kind} onValueChange={(value) => { setKind(value ?? "all"); }}>
              <SelectTrigger size="sm" className="h-7 w-full border-0 bg-transparent px-1 text-xs text-muted-foreground shadow-none" aria-label="Filter by format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All formats</SelectItem>
                {kinds.map((value) => <SelectItem key={value} value={value} className="text-xs">{value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                <p>No artifacts match.</p>
                <button type="button" onClick={() => { setQuery(""); setKind("all"); }} className="mt-2 underline underline-offset-4 hover:text-foreground">
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((artifact) => {
                  const Icon = kindIcons[artifact.kind];
                  const active = selected?.id === artifact.id;
                  return (
                    <li key={artifact.id}>
                      <button
                        type="button"
                        onClick={() => { setSelectedId(artifact.id); }}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full rounded-sm px-3 py-2.5 text-left transition-colors",
                          active ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <Icon className={cn("mt-0.5 size-3.5 shrink-0", kindColors[artifact.kind])} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h2 className="truncate text-[13px] font-medium">{artifact.title}</h2>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{dateFormat.format(new Date(artifact.updatedAt))}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{artifact.summary || artifact.content}</p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {artifact.project || "No project"}
                              {artifact.visibility === "unlisted" && " · Shared"}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
            {filtered.length} shown
          </div>
        </aside>

        {selected ? (
          <ArtifactEditor key={selected.id} artifact={selected} origin={origin} onUpdated={updated} onDeleted={deleted} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-sm text-center">
              <h2 className="text-lg font-medium">No artifacts yet</h2>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Create one here, or connect an agent and let it create artifacts through MCP.
              </p>
              <Button onClick={() => { setCreateOpen(true); }} className="mt-5"><IconPlus /> New artifact</Button>
            </div>
          </div>
        )}
      </div>

      <CreateArtifactDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={created} />
    </main>
  );
}
