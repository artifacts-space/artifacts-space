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
 * Enter or Tab to pick, and Escape to close. When nothing matches, a short
 * hint says why instead.
 */
export function useMentionAutocomplete({ body, setBody }: AutocompleteInput) {
  const { candidates, self } = useMentionables();
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [caret, setCaret] = useState(body.length);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState<ActiveOption>({ key: "", index: 0 });

  const { query, typed, matches, showing, open, key, activeIndex } = suggestionState({ body, caret, candidates, dismissed, active });

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
    if (!showing || !query || event.nativeEvent.isComposing) return;
    const start = query.start;
    const action = keyActions(open, { move, pickActive, dismiss: () => { setDismissed(start); } }).get(event.key);
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
    hint: showing && !open ? <MentionHint query={typed} self={self} hasCandidates={candidates.length > 0} /> : null,
  };
}

/** What the suggestions show for the text and caret: the "@" query, its matches, and the highlighted option. */
function suggestionState(input: { body: string; caret: number; candidates: readonly Mentionable[]; dismissed: number | null; active: ActiveOption }) {
  const query = activeMentionQuery(input.body, input.caret);
  const matches = query && input.candidates.length > 0 ? matchMentionables(input.candidates, query.query) : [];
  const showing = query !== null && input.dismissed !== query.start;
  const key = query ? `${String(query.start)}:${query.query}` : "";
  const activeIndex = input.active.key === key ? Math.min(input.active.index, matches.length - 1) : 0;
  return { query, typed: query?.query ?? "", matches, showing, open: showing && matches.length > 0, key, activeIndex };
}

interface KeyHandlers {
  move: (step: number) => void;
  pickActive: () => void;
  dismiss: () => void;
}

/** The keys the composer takes while an "@" is typed: list keys when suggestions show, else only Escape to close the hint. */
function keyActions(open: boolean, { move, pickActive, dismiss }: KeyHandlers) {
  if (!open) return new Map<string, () => void>([["Escape", dismiss]]);
  return new Map<string, () => void>([
    ["ArrowDown", () => { move(1); }],
    ["ArrowUp", () => { move(-1); }],
    ["Enter", pickActive],
    ["Tab", pickActive],
    ["Escape", dismiss],
  ]);
}

/** Why no suggestion shows for the "@" being typed, so the writer is never left guessing. */
function MentionHint({ query, self, hasCandidates }: { query: string; self: Mentionable | null; hasCandidates: boolean }) {
  const isSelf = self !== null && query.length > 0 && self.handle.startsWith(query);
  const message = isSelf
    ? "That is you. Mentioning yourself notifies no one."
    : hasCandidates
      ? "No match. You can mention this artifact's author and your teammates."
      : "No one to mention here yet. You can mention this artifact's author and your teammates.";
  return (
    <p role="status" className="absolute top-full left-0 z-50 mt-1 w-full max-w-80 rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
      {message}
    </p>
  );
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
