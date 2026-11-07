"use client";

import { type KeyboardEvent, useEffect, useRef } from "react";

export type CellCommitMove = "down" | "next" | "previous" | "none";

interface CsvCellEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Saves the draft to the cell, then moves the active cell. */
  onCommit: (move: CellCommitMove) => void;
  onCancel: () => void;
  label: string;
}

function commitMove(event: KeyboardEvent<HTMLTextAreaElement>): CellCommitMove | null {
  if (event.key === "Tab") return event.shiftKey ? "previous" : "next";
  if (event.key === "Enter" && !event.shiftKey && !event.altKey) return "down";
  return null;
}

/**
 * The text box over a cell while it is edited. Enter saves and moves down,
 * Tab saves and moves right, Shift+Enter adds a line break, and Escape puts
 * the cell back as it was. Leaving the box saves it.
 */
export function CsvCellEditor({ value, onChange, onCommit, onCancel, label }: CsvCellEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Keys typed here belong to the text, not to the grid around it.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      doneRef.current = true;
      onCancel();
      return;
    }
    const move = commitMove(event);
    if (move === null) return;
    event.preventDefault();
    doneRef.current = true;
    onCommit(move);
  }

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      aria-label={label}
      spellCheck={false}
      onChange={(event) => { onChange(event.target.value); }}
      onKeyDown={handleKeyDown}
      onBlur={() => { if (!doneRef.current) onCommit("none"); }}
      onClick={(event) => { event.stopPropagation(); }}
      onPaste={(event) => { event.stopPropagation(); }}
      onCopy={(event) => { event.stopPropagation(); }}
      className="absolute top-0 left-0 z-30 field-sizing-content max-h-48 min-h-full w-full min-w-full resize-none rounded-none bg-popover px-3 py-1.5 text-base leading-5 text-popover-foreground ring-2 ring-ring outline-none ring-inset sm:text-sm"
    />
  );
}
