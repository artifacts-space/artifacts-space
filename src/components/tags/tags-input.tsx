"use client";

import { IconTag, IconX } from "@tabler/icons-react";
import { useId, useRef, useState, useTransition } from "react";

import { listArtifactTagSuggestionsAction, setArtifactTagsAction } from "@/app/(workspace)/app/tag-actions";
import { tagLimits } from "@/lib/tags/limits";
import type { TagFacet } from "@/lib/tags/queries";
import { cn } from "@/lib/utils";

import { suggestionsFor, withTyped } from "./tag-suggestions";

interface TagsInputProps {
  /** The artifact's internal id. */
  artifactId: string;
  value: string[];
  onChange: (tags: string[]) => void;
}

/** The scope's tags for suggestions, loaded once on first focus. Only the newest load may set them. */
function useScopeTags(artifactId: string) {
  const [tags, setTags] = useState<TagFacet[]>([]);
  const request = useRef(0);
  const load = () => {
    if (request.current > 0) return;
    const id = ++request.current;
    listArtifactTagSuggestionsAction(artifactId)
      .then((result) => { if (id === request.current && result.success) setTags(result.data); })
      .catch(() => undefined);
  };
  return { tags, load };
}

/** One tag with its remove button. */
function TagChip({ tag, disabled, onRemove }: { tag: string; disabled: boolean; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 max-w-48 items-center gap-0.5 rounded-md bg-muted pr-0.5 pl-1.5 text-xs text-foreground">
      <span className="truncate">{tag}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove tag ${tag}`}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <IconX aria-hidden className="size-3" />
      </button>
    </span>
  );
}

interface SuggestionListProps {
  id: string;
  options: string[];
  highlight: number;
  onPick: (tag: string) => void;
}

function SuggestionList({ id, options, highlight, onPick }: SuggestionListProps) {
  return (
    <ul id={id} role="listbox" aria-label="Tag suggestions" className="absolute top-full left-0 z-20 mt-1 max-h-60 min-w-44 overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md">
      {options.map((tag, index) => (
        <li
          key={tag}
          id={`${id}-${String(index)}`}
          role="option"
          aria-selected={index === highlight}
          onPointerDown={(event) => { event.preventDefault(); onPick(tag); }}
          className={cn("cursor-default truncate rounded-md px-2 py-1", index === highlight && "bg-accent text-accent-foreground")}
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

/** Saves a new tag set at once, showing it right away and putting the old one back if the save fails. */
function useTagSave(artifactId: string, value: string[], onChange: (tags: string[]) => void) {
  const [shown, setShown] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function save(next: string[]) {
    setError(null);
    setShown(next);
    startTransition(async () => {
      const result = await setArtifactTagsAction(artifactId, next).catch(() => null);
      setShown(null);
      if (!result?.success) {
        setError(result?.error ?? "The tags did not change. Try again.");
        return;
      }
      onChange(result.data);
    });
  }
  return { tags: shown ?? value, error, pending, save, clearError: () => { setError(null); } };
}

/**
 * The tags of an artifact: remove one with its ×, add one by typing and
 * pressing Enter or a comma, or pick one the space already uses. Saves at
 * once, without a version or approval. For the artifact's author and team
 * only.
 */
export function TagsInput({ artifactId, value, onChange }: TagsInputProps) {
  const listId = useId();
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const scope = useScopeTags(artifactId);
  const { tags, error, pending, save, clearError } = useTagSave(artifactId, value, onChange);
  const options = open ? suggestionsFor(scope.tags, typed, tags) : [];
  const full = tags.length >= tagLimits.maxPerArtifact;

  function add(text: string) {
    const next = withTyped(tags, text);
    setTyped("");
    setHighlight(-1);
    if (next) save(next);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const handled = handleKey(event.key, { typed, tags, options, highlight, add, save, setHighlight, close: () => { setOpen(false); } });
    if (handled) event.preventDefault();
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <IconTag aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} disabled={pending} onRemove={() => { save(tags.filter((item) => item !== tag)); }} />
      ))}
      {full ? (
        <span className="text-xs text-muted-foreground">{tagLimits.maxPerArtifact} tags is the most an artifact can have.</span>
      ) : (
        <div className="relative">
          <input
            value={typed}
            onChange={(event) => { setTyped(event.target.value); setOpen(true); setHighlight(-1); clearError(); }}
            onFocus={() => { scope.load(); setOpen(true); }}
            onBlur={() => { setOpen(false); }}
            onKeyDown={onKeyDown}
            placeholder={tags.length === 0 ? "Add tags" : "Add tag"}
            aria-label="Add a tag"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-activedescendant={highlight >= 0 ? `${listId}-${String(highlight)}` : undefined}
            aria-invalid={error ? true : undefined}
            maxLength={tagLimits.maxChars * 2}
            className="h-6 w-28 rounded-md bg-transparent px-1 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          {options.length > 0 ? <SuggestionList id={listId} options={options} highlight={highlight} onPick={add} /> : null}
        </div>
      )}
      {error ? <p role="alert" className="w-full text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

interface KeyContext {
  typed: string;
  tags: string[];
  options: string[];
  highlight: number;
  add: (text: string) => void;
  save: (tags: string[]) => void;
  setHighlight: (index: number) => void;
  close: () => void;
}

const keyHandlers: Record<string, (context: KeyContext) => boolean> = {
  Enter: (context) => commit(context),
  ",": (context) => commit(context),
  ArrowDown: ({ options, highlight, setHighlight }) => {
    if (options.length === 0) return false;
    setHighlight((highlight + 1) % options.length);
    return true;
  },
  ArrowUp: ({ options, highlight, setHighlight }) => {
    if (options.length === 0) return false;
    setHighlight(highlight <= 0 ? options.length - 1 : highlight - 1);
    return true;
  },
  Escape: ({ close }) => {
    close();
    return true;
  },
  Backspace: ({ typed, tags, save }) => {
    if (typed !== "" || tags.length === 0) return false;
    save(tags.slice(0, -1));
    return true;
  },
};

/** Adds the highlighted suggestion, or else what was typed. Handled whenever there is something to add. */
function commit({ typed, options, highlight, add }: KeyContext): boolean {
  const picked = highlight >= 0 ? options[highlight] : undefined;
  if (picked) {
    add(picked);
    return true;
  }
  if (!typed.trim()) return false;
  add(typed);
  return true;
}

/** Runs the handler for a key in the tag input; true when it handled the key. */
function handleKey(key: string, context: KeyContext): boolean {
  const handler = keyHandlers[key];
  return handler ? handler(context) : false;
}
