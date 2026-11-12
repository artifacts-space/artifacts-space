"use client";

import { IconLink } from "@tabler/icons-react";

import { IconPicker } from "@/components/artifact-icon/icon-picker";
import { addIconTrigger, changeIconTrigger } from "@/components/artifact-icon/icon-triggers";
import { CopyButton } from "@/components/copy-button";
import { LineField } from "@/components/line-field";
import { cn } from "@/lib/utils";

import { scrollbarRoom } from "./detail-scroll";
import type { ArtifactDraft } from "./use-artifact-draft";

type UpdateDraft = <K extends keyof ArtifactDraft>(key: K, value: ArtifactDraft[K]) => void;

/** Notice shown while the artifact is shared by link or publicly: a band across the pane, with its words in the content's column (`column`), above the title they line up with. */
export function ShareBanner({ shareUrl, isPublic, column }: { shareUrl: string; isPublic: boolean; column: string }) {
  return (
    <div className={cn("border-b bg-muted/50 py-2", scrollbarRoom)}>
      <div className={cn(column, "flex flex-wrap items-center gap-3")}>
        <IconLink className="size-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{isPublic ? "Anyone can find and read this artifact." : "Anyone with the link can read this artifact."}</span>
        <CopyButton value={shareUrl} label="Copy link" variant="ghost" size="sm" className="ml-auto" />
      </div>
    </div>
  );
}

/** The icon above the title in the editor: part of the draft, saved with it. */
function DraftIcon({ icon, update }: { icon: string | null; update: UpdateDraft }) {
  const trigger = icon ? changeIconTrigger(icon, "heading") : addIconTrigger;
  return <div className="mb-1"><IconPicker value={icon} onChange={(next) => { update("icon", next); }} trigger={trigger} /></div>;
}

interface TitleFieldsProps {
  title: string;
  icon: string | null;
  summary: string;
  update: UpdateDraft;
  /** The title field, so a new artifact can put the cursor in it. */
  titleRef?: React.Ref<HTMLTextAreaElement>;
  /** Enter in the title moves on to the content. */
  onEnter?: () => void;
  /** The content's column (previewColumnClass), so the title lines up with the body. */
  column: string;
}

/**
 * Icon, title, and one-line summary fields. A long title or summary wraps
 * inside the column (LineField) instead of running off its right edge.
 */
export function TitleFields({ title, icon, summary, update, titleRef, onEnter, column }: TitleFieldsProps) {
  return (
    <div className={cn("group/title pt-6 sm:pt-10", scrollbarRoom)}>
      <div className={column}>
        <DraftIcon icon={icon} update={update} />
        <LineField
          ref={titleRef}
          value={title}
          onValueChange={(next) => { update("title", next); }}
          onEnter={onEnter}
          aria-label="Artifact title"
          className="text-3xl leading-tight font-semibold tracking-[-0.02em] sm:text-4xl"
          placeholder="Untitled artifact"
        />
        <LineField
          value={summary}
          onValueChange={(next) => { update("summary", next); }}
          aria-label="Artifact summary"
          className="mt-2 text-base leading-6 text-muted-foreground md:text-md"
          placeholder="Add a one-line summary for search and agent retrieval"
        />
      </div>
    </div>
  );
}
