"use client";

import { IconLink, IconLoader2 } from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatInfo } from "@/lib/artifact-formats";
import { kinds } from "@/lib/artifact-kinds";
import { cn } from "@/lib/utils";

import type { ArtifactDraft } from "./use-artifact-draft";

import type { EditorMode } from "./content-pane";

export type { EditorMode } from "./content-pane";
type UpdateDraft = <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;

const modes: EditorMode[] = ["edit", "preview"];
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Notice shown while the artifact has a public share link. */
export function ShareBanner({ shareUrl }: { shareUrl: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-5 py-2">
      <IconLink className="size-3.5 text-muted-foreground" />
      <span className="text-[13px] text-muted-foreground">Anyone with the link can read this artifact.</span>
      <CopyButton value={shareUrl} label="Copy link" variant="ghost" size="sm" className="ml-auto text-xs" />
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
        className="mt-2 w-full bg-transparent text-sm leading-6 text-muted-foreground outline-none placeholder:text-muted-foreground/60"
        placeholder="Add a one-line summary for search and agent retrieval"
      />
    </div>
  );
}

/** Edit and preview tabs, character count, and last update date. */
export function ModeBar({ mode, onMode, length, updatedAt }: { mode: EditorMode; onMode: (mode: EditorMode) => void; length: number; updatedAt: string }) {
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
              "rounded-[3px] px-2.5 py-0.5 text-xs capitalize transition-colors",
              mode === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{length.toLocaleString()} characters</span>
      <span className="ml-auto text-xs text-muted-foreground">Updated {dateFormat.format(new Date(updatedAt))}</span>
    </div>
  );
}

/** Project, format, and language fields below the content. */
export function MetaFields({ draft, update }: { draft: ArtifactDraft; update: UpdateDraft }) {
  return (
    <div className="grid gap-3 border-t bg-background/60 p-4 sm:grid-cols-3 sm:px-5">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-16 shrink-0">Project</span>
        <Input value={draft.project} onChange={(event) => { update("project", event.target.value); }} placeholder="None" className="h-8 bg-card text-[13px]" />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-16 shrink-0">Format</span>
        <Select value={draft.kind} onValueChange={(value) => { if (value) update("kind", value); }}>
          <SelectTrigger className="h-8 w-full bg-card text-[13px]"><SelectValue>{(value: ArtifactDraft["kind"]) => formatInfo[value].label}</SelectValue></SelectTrigger>
          <SelectContent>
            {kinds.map((value) => <SelectItem key={value} value={value} className="text-xs">{formatInfo[value].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-16 shrink-0">Language</span>
        <Input value={draft.language} onChange={(event) => { update("language", event.target.value); }} placeholder="Optional" className="h-8 bg-card text-[13px]" />
      </label>
    </div>
  );
}

/** Confirmation before deleting an artifact. */
export function DeleteDialog({
  open,
  onOpenChange,
  title,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  deleting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this artifact?</DialogTitle>
          <DialogDescription className="leading-6">
            “{title}” will be removed for you and for every agent that reads it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); }}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? <IconLoader2 className="animate-spin" /> : null} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
