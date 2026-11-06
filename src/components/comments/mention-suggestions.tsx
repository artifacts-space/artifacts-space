"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

import { PixelAvatar } from "@/components/pixel-avatar";
import { activeMentionQuery, insertMention, matchMentionables, type Mentionable } from "@/lib/comments/mention-autocomplete";
import { cn } from "@/lib/utils";

import { useMentionables } from "./mentionables-context";

interface AutocompleteInput {
  body: string;
  setBody: (body: string) => void;
}

/** Which suggestion is highlighted, tied to the query it was chosen for. */
interface ActiveOption {
  key: string;
  index: number;
}

/**
 * @mention suggestions for a textarea. Tracks the caret, lists matching
 * teammates while an "@handle" is being typed, and handles arrow keys,
 * Enter or Tab to pick, and Escape to close.
 */
export function useMentionAutocomplete({ body, setBody }: AutocompleteInput) {
  const candidates = useMentionables();
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [caret, setCaret] = useState(body.length);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState<ActiveOption>({ key: "", index: 0 });

  const query = activeMentionQuery(body, caret);
  const matches = query && candidates.length > 0 ? matchMentionables(candidates, query.query) : [];
  const open = query !== null && matches.length > 0 && dismissed !== query.start;
  const key = query ? `${String(query.start)}:${query.query}` : "";
  const activeIndex = active.key === key ? Math.min(active.index, matches.length - 1) : 0;

  useLayoutEffect(() => {
    const target = pendingCaret.current;
    if (target === null || !textareaRef.current) return;
    pendingCaret.current = null;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(target, target);
  }, [body]);

  function pick(candidate: Mentionable) {
    if (!query) return;
    const next = insertMention(body, query, caret, candidate.handle);
    pendingCaret.current = next.caret;
    setCaret(next.caret);
    setBody(next.text);
  }

  function move(step: number) {
    setActive({ key, index: (activeIndex + step + matches.length) % matches.length });
  }

  function pickActive() {
    const candidate = matches[activeIndex];
    if (candidate) pick(candidate);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || event.nativeEvent.isComposing) return;
    const start = query.start;
    const actions = new Map<string, () => void>([
      ["ArrowDown", () => { move(1); }],
      ["ArrowUp", () => { move(-1); }],
      ["Enter", pickActive],
      ["Tab", pickActive],
      ["Escape", () => { setDismissed(start); }],
    ]);
    const action = actions.get(event.key);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  function syncCaret(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCaret(event.currentTarget.selectionStart);
  }

  const optionId = (index: number) => `${listId}-option-${String(index)}`;

  return {
    textareaProps: {
      ref: textareaRef,
      onKeyDown,
      onSelect: syncCaret,
      "aria-autocomplete": "list" as const,
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant": open ? optionId(activeIndex) : undefined,
    },
    syncCaret,
    suggestions: open ? (
      <MentionSuggestionList
        id={listId}
        options={matches}
        activeIndex={activeIndex}
        optionId={optionId}
        onPick={pick}
        onHover={(index) => { setActive({ key, index }); }}
      />
    ) : null,
  };
}

interface ListProps {
  id: string;
  options: Mentionable[];
  activeIndex: number;
  optionId: (index: number) => string;
  onPick: (candidate: Mentionable) => void;
  onHover: (index: number) => void;
}

/** The suggestion list under the comment box. Pressing an option keeps focus in the textarea. */
function MentionSuggestionList({ id, options, activeIndex, optionId, onPick, onHover }: ListProps) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Mention suggestions"
      className="absolute top-full left-0 z-50 mt-1 w-full max-w-80 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {options.map((option, index) => (
        <li
          key={option.handle}
          id={optionId(index)}
          role="option"
          aria-selected={index === activeIndex}
          onPointerDown={(event) => { event.preventDefault(); }}
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
