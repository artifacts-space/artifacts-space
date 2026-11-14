"use client";

import { useEffect, useLayoutEffect, useRef, type ElementType, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { useBlockEditor } from "./block-editor-context";

/** The heading levels a block title takes. */
export type HeadingTag = "h1" | "h2" | "h3" | "h4";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  /** The element it renders as, so it keeps the block's own semantics and type. Not a heading: use `heading`. */
  as?: ElementType;
  /**
   * The heading the text is the title of. The heading keeps its role, so it
   * stays in the page's outline, and the text box sits inside it: a heading
   * may not itself be a text box. `className` then styles the heading.
   */
  heading?: HeadingTag | undefined;
  className?: string;
  /** The accessible name, such as "Heading text". */
  label: string;
  placeholder?: string;
  /** Shift+Enter adds a line break. Without it, text stays on one line. */
  multiline?: boolean;
  /** The block this text belongs to; it takes focus when the editor asks for that block. */
  blockKey: string;
  /** The longest text the prop takes (textLimit); typing stops there. */
  maxLength?: number | undefined;
  /** Enter (without Shift): usually starts a new block below. */
  onEnter?: (() => void) | undefined;
  /** "/" typed into empty text: opens the block menu here. */
  onSlash?: ((anchor: HTMLElement) => void) | undefined;
  /** Backspace in empty text: usually removes the block. */
  onEmptyBackspace?: (() => void) | undefined;
}

/** Text as typed: one line unless multiline, without the trailing break browsers add. */
function readText(element: HTMLElement, multiline: boolean) {
  const text = element.textContent;
  return multiline ? text : text.replace(/[\r\n]+/g, " ");
}

/** Handles Enter; returns true when it handled the key. Shift+Enter in multiline text is a line break. */
function handleEnter(event: KeyboardEvent<HTMLElement>, props: EditableTextProps): boolean {
  if (event.key !== "Enter" || (props.multiline && event.shiftKey)) return false;
  props.onEnter?.();
  return true;
}

/** Handles "/" and Backspace in empty text; returns true when it handled the key. */
function handleEmptyKey(event: KeyboardEvent<HTMLElement>, props: EditableTextProps): boolean {
  if (event.currentTarget.textContent !== "") return false;
  if (event.key === "/" && props.onSlash) {
    props.onSlash(event.currentTarget);
    return true;
  }
  if (event.key === "Backspace" && props.onEmptyBackspace) {
    props.onEmptyBackspace();
    return true;
  }
  return false;
}

/** Puts the caret at the end of `element`. */
function caretToEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handleKey(event: KeyboardEvent<HTMLElement>, props: EditableTextProps): boolean {
  return handleEnter(event, props) || handleEmptyKey(event, props);
}

/** The classes every editable text takes: its box, its caret, and its placeholder while empty. */
const editableClass = "block min-h-[1lh] min-w-[2ch] cursor-text rounded-sm outline-none focus-visible:bg-muted/40 empty:before:pointer-events-none empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)]";

/**
 * The heading around a title's text box. An empty title is no heading, as
 * in the read view, which leaves the heading out: `role="none"` keeps the
 * element (so the box keeps focus while the first letter is typed) but
 * takes it out of the outline.
 */
function TitleHeading({ tag: Tag, empty, className, children }: { tag: HeadingTag; empty: boolean; className: string | undefined; children: ReactNode }) {
  return <Tag role={empty ? "none" : undefined} className={className}>{children}</Tag>;
}

/**
 * Plain text you click and type into, in place, with the look of the block
 * around it. The browser owns the text while it has focus: React writes it
 * only when the value changes from outside (an undo, a merge, a reload), so
 * the caret never jumps while typing.
 */
export function EditableText(props: EditableTextProps) {
  const { value, onChange, as: Tag = "span", heading, className, label, placeholder = "", multiline = false, blockKey, maxLength } = props;
  const ref = useRef<HTMLElement>(null);
  const { takeFocus } = useBlockEditor();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || element.textContent === value) return;
    if (document.activeElement === element && readText(element, multiline) === value) return;
    element.textContent = value;
  }, [value, multiline]);

  useEffect(() => {
    const element = ref.current;
    if (element && takeFocus(blockKey)) element.focus();
  }, [blockKey, takeFocus]);

  const box = (
    <Tag
      ref={ref}
      role="textbox"
      aria-label={label}
      aria-multiline={multiline}
      contentEditable="plaintext-only"
      spellCheck
      data-placeholder={placeholder}
      onInput={(event: React.SyntheticEvent<HTMLElement>) => {
        const element = event.currentTarget;
        const text = readText(element, multiline);
        if (maxLength === undefined || text.length <= maxLength) {
          onChange(text);
          return;
        }
        // Past the limit the spec would break, so the extra characters are not kept.
        element.textContent = value;
        caretToEnd(element);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => { if (handleKey(event, props)) event.preventDefault(); }}
      className={cn(editableClass, "whitespace-pre-wrap", !multiline && "break-words", !heading && className)}
    />
  );
  if (!heading) return box;
  return <TitleHeading tag={heading} empty={value === ""} className={className}>{box}</TitleHeading>;
}
