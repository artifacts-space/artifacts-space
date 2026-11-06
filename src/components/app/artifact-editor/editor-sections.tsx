"use client";

import { IconLink } from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { LastEdited } from "@/components/history/last-edited";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatInfo } from "@/lib/artifact-formats";
import type { ArtifactEditorDto } from "@/lib/artifact-types";
import { kinds } from "@/lib/artifact-kinds";
import { cn } from "@/lib/utils";

import type { ArtifactDraft } from "./use-artifact-draft";

import type { EditorMode } from "./content-pane";

export type { EditorMode } from "./content-pane";
type UpdateDraft = <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;

const modes: EditorMode[] = ["edit", "preview"];

/** Notice shown while the artifact is shared by link or publicly. */
export function ShareBanner({ shareUrl, isPublic }: { shareUrl: string; isPublic: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-5 py-2">
      <IconLink className="size-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{isPublic ? "Anyone can find and read this artifact." : "Anyone with the link can read this artifact."}</span>
      <CopyButton value={shareUrl} label="Copy link" variant="ghost" size="sm" className="ml-auto" />
    </div>
  );
}

/** Title and one-line summary inputs. */
export function TitleFields({ title, summary, update }: { title: string; summary: string; update: UpdateDraft }) {
  return (
    <div className="border-b px-5 py-5 sm:px-7">
      <input
        value={title}
        onChange={(event) => { update("title", event.target.value); }}
        aria-label="Artifact title"
        className="w-full bg-transparent text-2xl font-medium tracking-[-0.015em] outline-none placeholder:text-muted-foreground/60"
        placeholder="Untitled artifact"
      />
      <input
        value={summary}
        onChange={(event) => { update("summary", event.target.value); }}
        aria-label="Artifact summary"
        className="mt-2 w-full bg-transparent text-base leading-6 md:text-md text-muted-foreground outline-none placeholder:text-muted-foreground/60"
        placeholder="Add a one-line summary for search and agent retrieval"
      />
    </div>
  );
}

interface ModeBarProps {
  mode: EditorMode;
  onMode: (mode: EditorMode) => void;
  length: number;
  updatedAt: string;
  updatedBy: ArtifactEditorDto | null;
}

/** Edit and preview tabs, character count, and who saved it last. */
export function ModeBar({ mode, onMode, length, updatedAt, updatedBy }: ModeBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-background/60 px-5 py-2 sm:px-7">
      <div className="flex rounded-sm border bg-muted p-0.5" role="tablist" aria-label="Editor mode">
        {modes.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => { onMode(value); }}
            className={cn(
              "rounded-[3px] px-2.5 py-0.5 text-sm capitalize transition-colors",
              mode === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{length.toLocaleString()} characters</span>
      <LastEdited editor={updatedBy} at={updatedAt} className="ml-auto" />
    </div>
  );
}

/** Project, format, and language fields below the content. */
export function MetaFields({ draft, update }: { draft: ArtifactDraft; update: UpdateDraft }) {
  return (
    <div className="grid gap-3 border-t bg-background/60 p-4 sm:grid-cols-3 sm:px-5">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="w-16 shrink-0">Project</span>
        <Input value={draft.project} onChange={(event) => { update("project", event.target.value); }} placeholder="None" className="h-8 bg-card" />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="w-16 shrink-0">Format</span>
        <Select value={draft.kind} onValueChange={(value) => { if (value) update("kind", value); }}>
          <SelectTrigger className="h-8 w-full bg-card text-sm"><SelectValue>{(value: ArtifactDraft["kind"]) => formatInfo[value].label}</SelectValue></SelectTrigger>
          <SelectContent>
            {kinds.map((value) => <SelectItem key={value} value={value}>{formatInfo[value].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="w-16 shrink-0">Language</span>
        <Input value={draft.language} onChange={(event) => { update("language", event.target.value); }} placeholder="Optional" className="h-8 bg-card" />
      </label>
    </div>
  );
}
