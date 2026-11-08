"use client";

import { IconTag, IconX } from "@tabler/icons-react";
import { useId, useRef, useState, useTransition } from "react";

import { changeArtifactTagsAction, listArtifactTagSuggestionsAction } from "@/app/(workspace)/app/tag-actions";
import { tagLimits } from "@/lib/tags/limits";
import type { TagFacet } from "@/lib/tags/queries";
import { cn } from "@/lib/utils";

import { suggestionsFor, typedTags } from "./tag-suggestions";

interface TagsInputProps {
  /** The artifact's internal id. */
  artifactId: string;
  value: string[];
  onChange: (tags: string[]) => void;
}

interface TagChange {
  add: string[];
  remove: string[];
}

/** The scope's tags for suggestions, loaded on first focus. Only the newest load may set them; a failed one tries again next time. */
function useScopeTags(artifactId: string) {
  const [tags, setTags] = useState<TagFacet[]>([]);
  const request = useRef(0);
  const loaded = useRef(false);
  const load = () => {
    if (loaded.current) return;
    loaded.current = true;
    const id = ++request.current;
    listArtifactTagSuggestionsAction(artifactId)
      .then((result) => {
        if (id !== request.current) return;
        if (result.success) setTags(result.data);
        else loaded.current = false;
      })
      .catch(() => { loaded.current = false; });
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

/**
 * Saves tag changes at once. The change shows right away; the server applies
 * it to the tags as they are then (keeping any an agent added meanwhile) and
 * the saved set replaces the shown one. A failed save puts the old set back
 * and says why.
 */
function useTagSave(artifactId: string, value: string[], onChange: (tags: string[]) => void) {
  const [shown, setShown] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Saves run one after another; the shown set waits for the last one, so it never flashes back to an older set.
  const inFlight = useRef(0);
  const tags = shown ?? value;
  function save(change: TagChange) {
    setError(null);
    setShown([...tags.filter((tag) => !change.remove.includes(tag)), ...change.add]);
    inFlight.current += 1;
    startTransition(async () => {
      const result = await changeArtifactTagsAction(artifactId, change).catch(() => null);
      inFlight.current -= 1;
      if (inFlight.current === 0) setShown(null);
      if (!result?.success) {
        setError(result?.error ?? "The tags did not change. Try again.");
        return;
      }
      onChange(result.data);
    });
  }
  return { tags, error, pending, save, showError: setError };
}

/**
 * The tags of an artifact: remove one with its ×, add some by typing (commas
 * separate tags) and pressing Enter or a comma, or pick one the space already
 * uses. Saves at once, without a version or approval. For the artifact's
 * author and team only.
 */
export function TagsInput({ artifactId, value, onChange }: TagsInputProps) {
  const listId = useId();
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const scope = useScopeTags(artifactId);
  const { tags, error, pending, save, showError } = useTagSave(artifactId, value, onChange);
  const options = open ? suggestionsFor(scope.tags, typed, tags) : [];
  const full = tags.length >= tagLimits.maxPerArtifact;

  function add(text: string) {
    const result = typedTags(tags, text);
    if ("error" in result) {
      showError(result.error);
      return;
    }
    setTyped("");
    setHighlight(-1);
    if (result.add.length > 0) save({ add: result.add, remove: [] });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Removing waits for the last save, and a held Backspace never clears every tag.
    if (event.key === "Backspace" && (pending || event.repeat)) return;
    const context: KeyContext = { typed, tags, options, highlight, add, setHighlight, close: () => { setOpen(false); }, removeLast: (tag) => { save({ add: [], remove: [tag] }); } };
    if (handleKey(event.key, context)) event.preventDefault();
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <IconTag aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} disabled={pending} onRemove={() => { save({ add: [], remove: [tag] }); }} />
      ))}
      <div className="relative">
        <input
          value={typed}
          onChange={(event) => { setTyped(event.target.value); setOpen(true); setHighlight(-1); showError(null); }}
          onFocus={() => { scope.load(); setOpen(true); }}
          onBlur={() => { setOpen(false); }}
          onKeyDown={onKeyDown}
          disabled={full}
          placeholder={full ? `${String(tagLimits.maxPerArtifact)} tags is the most` : tags.length === 0 ? "Add tags" : "Add tag"}
          aria-label="Add a tag"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={highlight >= 0 ? `${listId}-${String(highlight)}` : undefined}
          aria-invalid={error ? true : undefined}
          className="h-6 w-32 rounded-md bg-transparent px-1 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed sm:text-sm"
        />
        {options.length > 0 ? <SuggestionList id={listId} options={options} highlight={highlight} onPick={add} /> : null}
      </div>
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
  setHighlight: (index: number) => void;
  close: () => void;
  removeLast: (tag: string) => void;
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
  // Only closes an open list, so Escape still reaches a dialog or sheet around the input.
  Escape: ({ options, close }) => {
    if (options.length === 0) return false;
    close();
    return true;
  },
  Backspace: ({ typed, tags, removeLast }) => {
    const last = tags.at(-1);
    if (typed !== "" || last === undefined) return false;
    removeLast(last);
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
