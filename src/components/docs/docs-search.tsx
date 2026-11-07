"use client";

import { Dialog } from "@base-ui/react/dialog";
import { IconCornerDownLeft, IconHash, IconFileText, IconPuzzle, IconSearch, IconTool } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";

import type { DocsSearchEntry } from "@/lib/docs/navigation";
import { searchDocs } from "@/lib/docs/search";
import { cn } from "@/lib/utils";

const kindIcons = { page: IconFileText, heading: IconHash, component: IconPuzzle, tool: IconTool } as const;

/** True when the key press happened while typing in a field. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Opens the dialog on ⌘K, Ctrl+K, or "/" (when not typing). */
function useOpenShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !isTyping(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [open]);
}

function ResultRow({ entry, active, id, onPick, onHover }: { entry: DocsSearchEntry; active: boolean; id: string; onPick: () => void; onHover: () => void }) {
  const Icon = kindIcons[entry.kind];
  return (
    <li id={id} role="option" aria-selected={active}>
      <button
        type="button"
        onClick={onPick}
        onMouseMove={onHover}
        className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left", active ? "bg-muted text-foreground" : "text-muted-foreground")}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm text-foreground", entry.kind === "tool" && "font-mono")}>{entry.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{entry.context}</span>
        </span>
        {active ? <IconCornerDownLeft aria-hidden className="size-3.5 shrink-0" /> : null}
      </button>
    </li>
  );
}

/**
 * Search over page titles, headings, components, and MCP tools. Everything
 * runs in the browser over a small index built at render time.
 */
export function DocsSearch({ index }: { index: DocsSearchEntry[] }) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchDocs(index, query), [index, query]);
  useOpenShortcut(() => { setOpen(true); });

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) { setQuery(""); setActive(0); }
  }

  function pick(entry: DocsSearchEntry | undefined) {
    if (!entry) return;
    changeOpen(false);
    router.push(entry.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (results.length === 0 ? 0 : (current + step + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(results[active]);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger
        data-docs-search-trigger=""
        className="flex h-8 w-full items-center gap-2 rounded-lg border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-56"
      >
        <IconSearch aria-hidden className="size-3.5" />
        <span className="flex-1 text-left">Search docs</span>
        <kbd className="hidden rounded border px-1 font-sans text-xs sm:inline">⌘K</kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-[12vh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
          <Dialog.Title className="sr-only">Search the docs</Dialog.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <IconSearch aria-hidden className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search pages, headings, components, and tools"
              aria-label="Search the docs"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-activedescendant={results.length > 0 ? `${listId}-${String(active)}` : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto overscroll-contain p-2">
            {results.map((entry, position) => (
              <ResultRow
                key={`${entry.href}-${entry.title}`}
                id={`${listId}-${String(position)}`}
                entry={entry}
                active={position === active}
                onPick={() => { pick(entry); }}
                onHover={() => { setActive(position); }}
              />
            ))}
            {query.trim() && results.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No results for “{query.trim()}”.</li> : null}
            {!query.trim() ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">Type to search page titles, headings, components, and MCP tools.</li> : null}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
