"use client";

import { IconArrowBackUp, IconArrowForwardUp, IconPlus } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { CommentButton } from "./comment-button";
import { FormatButtons, LinkEditor, ToolButton } from "./format-controls";
import { insertBlock, slashCommands } from "./slash-commands";

interface TouchToolbarProps {
  editor: Editor;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
}

/** Insert any block from a menu, for screens without a keyboard slash. */
function InsertMenu({ editor }: { editor: Editor }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="gap-1 px-2" />}>
        <IconPlus aria-hidden /> Insert
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        {slashCommands.map((command) => (
          <DropdownMenuItem key={command.id} onClick={() => { insertBlock(editor, command); }}>
            <command.icon aria-hidden className="text-muted-foreground" />
            {command.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The editing bar's height, so the toolbar sticks just under it even when the bar wraps. */
function useStickyOffset(ref: React.RefObject<HTMLElement | null>): number {
  const [top, setTop] = useState(56);
  useEffect(() => {
    const bar = ref.current?.closest("form")?.querySelector<HTMLElement>("[data-slot=editor-bar]");
    if (!bar) return;
    const observer = new ResizeObserver(() => { setTop(bar.offsetHeight); });
    observer.observe(bar);
    return () => { observer.disconnect(); };
  }, [ref]);
  return top;
}

/**
 * A slim toolbar for touch screens, where a menu over the selection fights
 * the system's own selection menu: insert a block, format the selection,
 * add a link, comment on the selection, undo, and redo. It sticks under the editing bar while you scroll.
 */
export function TouchToolbar({ editor, linkOpen, onLinkOpenChange }: TouchToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const top = useStickyOffset(ref);
  const history = useEditorState({
    editor,
    selector: ({ editor: current }) => ({ undo: current.can().undo(), redo: current.can().redo() }),
  });
  return (
    <div ref={ref} role="toolbar" aria-label="Format" style={{ top: `calc(var(--artifact-chrome-height, 0px) + ${String(top)}px)` }} className="sticky z-[5] -mx-1 mb-3 flex items-center gap-0.5 overflow-x-auto rounded-lg bg-background/95 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {linkOpen ? (
        <LinkEditor editor={editor} onDone={() => { onLinkOpenChange(false); }} />
      ) : (
        <>
          <InsertMenu editor={editor} />
          <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <FormatButtons editor={editor} onLink={() => { onLinkOpenChange(true); }} />
          <CommentButton />
          <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <ToolButton icon={IconArrowBackUp} label="Undo" disabled={!history.undo} onPress={() => { editor.chain().focus().undo().run(); }} />
          <ToolButton icon={IconArrowForwardUp} label="Redo" disabled={!history.redo} onPress={() => { editor.chain().focus().redo().run(); }} />
        </>
      )}
    </div>
  );
}
