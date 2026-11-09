"use client";

import { type KeyboardEvent, useId, useRef, useState } from "react";

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
 * back, and leaving the field saves.
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
        <EditableValue key={`${place}\u0000${value}`} id={id} value={value} onCommit={onCommit} onDone={onDone} />
      ) : (
        <textarea id={id} readOnly value={value} rows={1} spellCheck={false} aria-label="Cell value" className={fieldClass} />
      )}
    </div>
  );
}

function EditableValue({ id, value, onCommit, onDone }: { id: string; value: string; onCommit: (value: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(value);
  // Enter and Escape decide themselves; the blur their focus move causes must not save again.
  const decided = useRef(false);

  function finish(save: boolean) {
    decided.current = true;
    if (save && draft !== value) onCommit(draft);
    else setDraft(value);
    onDone();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
    event.preventDefault();
    finish(true);
  }

  return (
    <textarea
      id={id}
      value={draft}
      rows={1}
      spellCheck={false}
      aria-label="Cell value"
      onChange={(event) => { decided.current = false; setDraft(event.target.value); }}
      onKeyDown={handleKeyDown}
      onBlur={() => { if (!decided.current && draft !== value) onCommit(draft); }}
      className={fieldClass}
    />
  );
}
