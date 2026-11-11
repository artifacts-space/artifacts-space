"use client";

import { IconTextCaption, IconTextWrap } from "@tabler/icons-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { CopyIconButton } from "@/components/copy-icon-button";
import { IconButton } from "@/components/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { diagramViews, type DiagramView } from "@/lib/markdown/fence-info";

import type { CodeBlockAttrs } from "./code-block-attrs";
import { CodeLanguagePicker } from "./code-language-picker";

const viewLabels: Record<DiagramView, string> = { code: "Code", preview: "Preview", split: "Split" };

/** The second picker on a diagram: Code, Preview, or Split. */
function DiagramViewPicker({ view, disabled, onChange }: { view: DiagramView; disabled: boolean; onChange: (view: DiagramView) => void }) {
  return (
    <Select value={view} disabled={disabled} onValueChange={(next) => { if (next) onChange(next); }}>
      <SelectTrigger size="sm" aria-label="Diagram view" className="h-7 border-transparent bg-transparent text-xs text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent">
        <SelectValue>{(value: DiagramView) => viewLabels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {diagramViews.map((option) => <SelectItem key={option} value={option}>{viewLabels[option]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export interface CodeBlockToolbarProps {
  /** The block's language, or "plain". */
  language: string;
  /** The block's source, for Copy. */
  code: string;
  editable: boolean;
  /** A mermaid block's view, which adds the view picker; null for other code. */
  view: DiagramView | null;
  wrap: boolean;
  /** True while the block shows a caption (or its field), which hides the Caption button. */
  captionShown: boolean;
  onLanguage: (language: string | null) => void;
  onView: (view: DiagramView) => void;
  onWrap: (wrap: boolean) => void;
  onCaption: () => void;
}

/**
 * The bar along the top of a code block. On the left, the language picker,
 * and on a diagram the view picker beside it (Code, Preview, Split). On the
 * right, Copy, Wrap code, and Caption, shown while the block is hovered or
 * focused, and always on touch screens. Wrap code and Caption are for
 * editors only.
 */
export function CodeBlockToolbar({ language, code, editable, view, wrap, captionShown, onLanguage, onView, onWrap, onCaption }: CodeBlockToolbarProps) {
  return (
    <div contentEditable={false} data-code-toolbar="" className="flex min-h-9 items-center gap-1 border-b border-code-border pr-1.5 pl-1.5 select-none">
      <CodeLanguagePicker language={language} disabled={!editable} onChange={onLanguage} />
      {view ? <DiagramViewPicker view={view} disabled={!editable} onChange={onView} /> : null}
      <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/code:opacity-100 group-focus-within/code:opacity-100 pointer-coarse:opacity-100">
        <CopyIconButton value={code} label="Copy code" />
        {editable ? (
          <IconButton label="Wrap code" pressed={wrap} onClick={() => { onWrap(!wrap); }} className={wrap ? "text-foreground" : undefined}>
            <IconTextWrap />
          </IconButton>
        ) : null}
        {editable && !captionShown ? (
          <IconButton label="Caption" onClick={onCaption}>
            <IconTextCaption />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The caption under a code block: one line of plain text. It saves when the
 * field loses focus or on Enter; Escape puts back what was saved. Saving it
 * empty removes the caption. `onDone` runs whenever the field loses focus.
 */
export function CodeCaptionField({ caption, autoFocus, onCommit, onDone }: { caption: string; autoFocus: boolean; onCommit: (caption: string) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(caption);
  const cancelled = useRef(false);
  const [seen, setSeen] = useState(caption);
  // A caption changed elsewhere (undo, an agent's save) replaces the draft.
  if (seen !== caption) {
    setSeen(caption);
    setDraft(caption);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key !== "Escape") return;
    cancelled.current = true;
    setDraft(caption);
    event.currentTarget.blur();
  }
  return (
    <div contentEditable={false} className="mt-2">
      <input
        value={draft}
        aria-label="Caption"
        placeholder="Write a caption"
        autoFocus={autoFocus}
        onChange={(event) => { setDraft(event.target.value); }}
        onBlur={() => {
          if (!cancelled.current && draft !== caption) onCommit(draft);
          cancelled.current = false;
          onDone();
        }}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-base text-muted-foreground outline-none placeholder:text-muted-foreground/60 md:text-sm"
      />
    </div>
  );
}

/** The caption field under a block, while it has a caption or Caption was just pressed. */
export function BlockCaptionField({ attrs }: { attrs: CodeBlockAttrs }) {
  if (!attrs.captionShown) return null;
  return <CodeCaptionField caption={attrs.fence.caption ?? ""} autoFocus={attrs.captionFocus} onCommit={attrs.setCaption} onDone={attrs.closeCaption} />;
}
