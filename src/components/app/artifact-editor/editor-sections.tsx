"use client";

import { IconLink } from "@tabler/icons-react";

import { IconPicker } from "@/components/artifact-icon/icon-picker";
import { addIconTrigger, changeIconTrigger } from "@/components/artifact-icon/icon-triggers";
import { CopyButton } from "@/components/copy-button";

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

interface TitleFieldsProps {
  title: string;
  icon: string | null;
  summary: string;
  update: UpdateDraft;
  /** The title field, so a new artifact can put the cursor in it. */
  titleRef?: React.Ref<HTMLInputElement>;
  /** Enter in the title moves on to the content. */
  onEnter?: () => void;
  /** The content's column (previewColumnClass), so the title lines up with the body. */
  column: string;
}

/** Icon, title, and one-line summary inputs. */
export function TitleFields({ title, icon, summary, update, titleRef, onEnter, column }: TitleFieldsProps) {
  return (
    <div className="group/title pt-6 sm:pt-10">
      <div className={column}>
      <DraftIcon icon={icon} update={update} />
      <input
        ref={titleRef}
        value={title}
        onChange={(event) => { update("title", event.target.value); }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing || !onEnter) return;
          event.preventDefault();
          onEnter();
        }}
        aria-label="Artifact title"
        className="w-full bg-transparent text-3xl leading-tight font-semibold tracking-[-0.02em] outline-none placeholder:text-muted-foreground/60 sm:text-4xl"
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
    </div>
  );
}
