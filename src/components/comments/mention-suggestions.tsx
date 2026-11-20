"use client";

import { PixelAvatar } from "@/components/pixel-avatar";
import type { Mentionable } from "@/lib/comments/mention-autocomplete";
import { cn } from "@/lib/utils";

/** The popover look the suggestions and the hint share, under the "@" being typed. */
export const mentionPopoverClass = "z-50 max-w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md";

/** Why no suggestion shows for the "@" being typed, so the writer is never left guessing. */
export function MentionHint({ query, self, hasCandidates, list = "ready" }: { query: string; self: Mentionable | null; hasCandidates: boolean; list?: MentionListState }) {
  return (
    <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
      {hintMessage(self !== null && query.length > 0 && self.handle.startsWith(query), hasCandidates, list)}
    </p>
  );
}

/**
 * What is known about who can be mentioned: the list is here ("ready"), on
 * its way, or could not be loaded. The hint claims that nobody can be
 * mentioned, or that nothing matches, only of a list that is here.
 */
export type MentionListState = "ready" | "loading" | "unavailable";

/** The list is on its way: the hint is replaced by the list as soon as it arrives. */
export const MENTIONS_LOADING = "Loading the people you can mention…";

/** The list could not be loaded: nothing is known about who can be mentioned, so the hint claims nothing about it. */
export const MENTIONS_UNAVAILABLE = "The list of people to mention could not be loaded. A handle typed in full still reaches its owner once they can read this artifact.";

function hintMessage(isSelf: boolean, hasCandidates: boolean, list: MentionListState): string {
  if (isSelf) return "That is you. Mentioning yourself notifies no one.";
  if (list === "loading") return MENTIONS_LOADING;
  if (list === "unavailable") return MENTIONS_UNAVAILABLE;
  return hasCandidates ? "No match. You can mention this artifact's author and your teammates." : "No one to mention here yet. You can mention this artifact's author and your teammates.";
}

interface ListProps {
  id: string;
  options: readonly Mentionable[];
  activeIndex: number;
  optionId: (index: number) => string;
  onPick: (candidate: Mentionable) => void;
  onHover: (index: number) => void;
}

/** The suggestion list under the "@" being typed. Pressing an option keeps focus in the comment box. */
export function MentionSuggestionList({ id, options, activeIndex, optionId, onPick, onHover }: ListProps) {
  return (
    <ul id={id} role="listbox" aria-label="Mention suggestions" className="p-1">
      {options.map((option, index) => (
        <li
          key={option.handle}
          id={optionId(index)}
          role="option"
          aria-selected={index === activeIndex}
          onPointerDown={(event) => { event.preventDefault(); }}
          onMouseDown={(event) => { event.preventDefault(); }}
          onPointerMove={() => { onHover(index); }}
          onClick={() => { onPick(option); }}
          className={cn("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm", index === activeIndex && "bg-accent text-accent-foreground")}
        >
          <PixelAvatar seed={option.userId} kind={option.kind} size={20} />
          <span className="font-mono">@{option.handle}</span>
          {option.name && option.name !== option.handle ? <span className="truncate text-xs text-muted-foreground">{option.name}</span> : null}
          {option.kind === "agent" ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">Agent</span> : null}
        </li>
      ))}
    </ul>
  );
}
