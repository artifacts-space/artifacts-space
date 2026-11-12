"use client";

import { PixelAvatar } from "@/components/pixel-avatar";
import type { Mentionable } from "@/lib/comments/mention-autocomplete";
import { cn } from "@/lib/utils";

/** The popover look the suggestions and the hint share, under the "@" being typed. */
export const mentionPopoverClass = "z-50 max-w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md";

/** Why no suggestion shows for the "@" being typed, so the writer is never left guessing. */
export function MentionHint({ query, self, hasCandidates }: { query: string; self: Mentionable | null; hasCandidates: boolean }) {
  const isSelf = self !== null && query.length > 0 && self.handle.startsWith(query);
  const message = isSelf
    ? "That is you. Mentioning yourself notifies no one."
    : hasCandidates
      ? "No match. You can mention this artifact's author and your teammates."
      : "No one to mention here yet. You can mention this artifact's author and your teammates.";
  return (
    <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
      {message}
    </p>
  );
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
