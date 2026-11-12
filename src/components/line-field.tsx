"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const breaksAtEnds = /^\s*[\r\n]+\s*|\s*[\r\n]+\s*$/g;
const breaksInside = /\s*[\r\n]+\s*/g;

/**
 * One line of text: a line break inside it, with the space around it,
 * becomes one space, and a break at either end (a pasted line often ends
 * with one) goes without leaving a space.
 */
export function singleLine(value: string): string {
  return value.replace(breaksAtEnds, "").replace(breaksInside, " ");
}

interface LineFieldProps extends Omit<ComponentProps<"textarea">, "value" | "onChange" | "onKeyDown" | "rows"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Enter never adds a line. With this, it moves on instead, for example to the content. */
  onEnter?: (() => void) | undefined;
}

/**
 * A one-line field (a title, a summary) that wraps: text longer than the
 * field's width runs onto the next line and the field grows to show all of
 * it, where an `<input>` would cut it off at its edge. It still holds one
 * line of text: Enter adds no break, and pasted breaks become spaces.
 */
export function LineField({ value, onValueChange, onEnter, className, ...props }: LineFieldProps) {
  return (
    <textarea
      {...props}
      value={value}
      rows={1}
      onChange={(event) => { onValueChange(singleLine(event.target.value)); }}
      onKeyDown={(event) => {
        // Enter that confirms an input method's composition is not ours.
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEnter?.();
      }}
      className={cn("block w-full resize-none overflow-hidden bg-transparent field-sizing-content outline-none placeholder:text-muted-foreground/60", className)}
    />
  );
}
