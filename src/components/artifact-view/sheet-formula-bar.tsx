"use client";

import { type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from "react";

interface SheetFormulaBarProps {
  /** Where the selection is, such as "region · 14". */
  place: string;
  /** The active cell's full value. */
  value: string;
  /** Null for readers, who can read and select the value but not change it. */
  onCommit: ((value: string) => void) | null;
  /** Hands focus back to the grid after Enter or Escape. */
  onDone: () => void;
}

const fieldClass =
  "block max-h-24 min-h-8 w-full min-w-0 resize-none bg-transparent px-2 py-1.5 font-mono text-base leading-5 field-sizing-content outline-none sm:text-sm";

/**
 * The slim bar above the sheet that shows the active cell's whole value,
 * as a spreadsheet's formula bar does: long text and line breaks that the
 * cell cuts off are all here. Readers can select and read it. Editors can
 * change it: Enter saves, Shift+Enter adds a line break, Escape puts it
 * back, and leaving the field saves, also when a click on another cell
 * moves the selection away. Enter or Escape hands focus back to the grid.
 */
export function SheetFormulaBar({ place, value, onCommit, onDone }: SheetFormulaBarProps) {
  const id = useId();
  return (
    <div data-formula-bar="" className="flex min-w-0 items-stretch border border-b-0 border-border/70 bg-card text-sm">
      <label htmlFor={id} className="flex w-28 shrink-0 items-center truncate border-r border-border/60 bg-muted px-2 text-xs text-muted-foreground sm:w-44">
        <span className="sr-only">Cell </span>
        {place}
      </label>
      {/* A fresh field per cell and value, so the draft never carries over to another cell. */}
      {onCommit ? (
        <EditableValue key={`${place}\u0000${value}`} id={id} label={`Cell value, ${place}`} value={value} onCommit={onCommit} onDone={onDone} />
      ) : (
        <textarea id={id} readOnly value={value} rows={1} spellCheck={false} aria-label={`Cell value, ${place}`} onKeyDown={(event) => { backToGrid(event, onDone); }} className={fieldClass} />
      )}
    </div>
  );
}

/** Enter or Escape in the read-only field goes back to the grid. */
function backToGrid(event: KeyboardEvent<HTMLTextAreaElement>, onDone: () => void) {
  if (event.key !== "Enter" && event.key !== "Escape") return;
  event.preventDefault();
  onDone();
}

/**
 * Saves a draft the field still holds when it goes away: a click on another
 * cell changes the selection, and with it this field, before the browser
 * moves focus, so its blur never comes.
 */
function useSaveOnUnmount(pending: RefObject<string | null>, value: string, onCommit: (value: string) => void) {
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; }, [onCommit]);
  useEffect(() => () => {
    const draft = pending.current;
    if (draft !== null && draft !== value) commit.current(draft);
  }, [pending, value]);
}

function EditableValue({ id, label, value, onCommit, onDone }: { id: string; label: string; value: string; onCommit: (value: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(value);
  // The draft not saved yet, or null once Enter, Escape, or a blur decided. A blur after Enter or Escape must not save again.
  const unsaved = useRef<string | null>(null);
  useSaveOnUnmount(unsaved, value, onCommit);

  function change(next: string) {
    unsaved.current = next;
    setDraft(next);
  }

  function save() {
    if (unsaved.current === null) return;
    unsaved.current = null;
    if (draft !== value) onCommit(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const escape = event.key === "Escape";
    if (!escape && (event.key !== "Enter" || event.shiftKey || event.altKey)) return;
    event.preventDefault();
    if (escape) {
      unsaved.current = null;
      setDraft(value);
    } else save();
    onDone();
  }

  return (
    <textarea
      id={id}
      value={draft}
      rows={1}
      spellCheck={false}
      aria-label={label}
      onChange={(event) => { change(event.target.value); }}
      onKeyDown={handleKeyDown}
      onBlur={save}
      className={fieldClass}
    />
  );
}
