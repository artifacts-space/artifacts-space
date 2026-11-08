"use client";

import { IconLink } from "@tabler/icons-react";

import { IconPicker } from "@/components/artifact-icon/icon-picker";
import { addIconTrigger, changeIconTrigger } from "@/components/artifact-icon/icon-triggers";
import { CopyButton } from "@/components/copy-button";
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

import type { ArtifactDraft } from "./use-artifact-draft";

type UpdateDraft = <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;

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

/** The icon above the title in the editor: part of the draft, saved with it. */
function DraftIcon({ icon, update }: { icon: string | null; update: UpdateDraft }) {
  const trigger = icon ? changeIconTrigger(icon, "heading") : addIconTrigger;
  return <div className="mb-1"><IconPicker value={icon} onChange={(next) => { update("icon", next); }} trigger={trigger} /></div>;
}

/** Icon, title, and one-line summary inputs. */
export function TitleFields({ title, icon, summary, update }: { title: string; icon: string | null; summary: string; update: UpdateDraft }) {
  return (
    <div className="group/title border-b px-5 py-5 sm:px-7">
      <DraftIcon icon={icon} update={update} />
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

/** Format and language fields below the content. The project is set beside the summary (src/components/projects). */
export function MetaFields({ draft, update }: { draft: ArtifactDraft; update: UpdateDraft }) {
  return (
    <div className="grid gap-3 border-t bg-background/60 p-4 sm:grid-cols-2 sm:px-5">
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
