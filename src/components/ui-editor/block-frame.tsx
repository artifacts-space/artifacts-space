"use client";

import { IconArrowDown, IconArrowUp, IconCopy, IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { moveBlock } from "@/lib/ui/spec-blocks";
import { cn } from "@/lib/utils";

import { duplicate, nudge, removeBlock } from "./block-changes";
import { useBlockEditor, useIsActiveBlock } from "./block-editor-context";

type DropSide = "before" | "after";

/** Which half of the block the pointer is over while something is dragged onto it. */
function dropSide(event: DragEvent<HTMLElement>): DropSide {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? "before" : "after";
}

interface BlockFrameProps {
  id: string;
  /** The block's type, for the handle's accessible name. */
  type: string;
  parent: string;
  index: number;
  children: ReactNode;
}

/** "+" and the drag handle beside a block; the handle opens Duplicate, Move, and Delete. */
function BlockHandle({ id, type, frame }: { id: string; type: string; frame: React.RefObject<HTMLDivElement | null> }) {
  const editor = useBlockEditor();
  const shown = useIsActiveBlock(id);
  const grip = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      data-slot="block-handle"
      className={cn(
        // Beside the block on wider screens; on phones, where the margin is narrow, above its top-right corner.
        "absolute z-10 flex items-center transition-opacity motion-reduce:transition-none",
        "max-sm:-top-7 max-sm:right-0 max-sm:rounded-md max-sm:bg-popover max-sm:shadow-sm sm:top-0 sm:right-full sm:mr-0.5",
        shown || menuOpen ? "opacity-100" : "opacity-0 focus-within:opacity-100",
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Add a block below this ${type}`}
        onClick={() => { if (frame.current) editor.openInsert({ kind: "after", key: id }, frame.current); }}
        className="text-muted-foreground"
      >
        <IconPlus />
      </Button>
      {/* The grip drags the block; a click opens its actions. It is not a menu trigger, which would open on press and stop the drag. */}
      <Button
        ref={grip}
        variant="ghost"
        size="icon-xs"
        aria-label={`${type} block: drag to move, or open its actions`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        draggable
        onClick={() => { setMenuOpen(true); }}
        onDragStart={(event: DragEvent<HTMLButtonElement>) => {
          editor.dragging.set(id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", id);
          if (frame.current) event.dataTransfer.setDragImage(frame.current, 0, 0);
        }}
        onDragEnd={() => { editor.dragging.set(null); }}
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
      >
        <IconGripVertical />
      </Button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuContent anchor={grip} align="start" className="w-44">
          <DropdownMenuItem onClick={() => { editor.apply((raw) => duplicate(raw, id)); }}><IconCopy /> Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { editor.apply((raw) => nudge(raw, id, -1)); }}><IconArrowUp /> Move up</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { editor.apply((raw) => nudge(raw, id, 1)); }}><IconArrowDown /> Move down</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => { editor.apply((raw) => removeBlock(raw, id)); }}><IconTrash /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * One block in the interface editor: the block itself, with a handle that
 * appears on hover or focus. Drag the handle onto another block to move it
 * before or after that block, among that block's siblings.
 */
export function BlockFrame({ id, type, parent, index, children }: BlockFrameProps) {
  const editor = useBlockEditor();
  const frame = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<DropSide | null>(null);
  const activate = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    editor.active.set(id);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    const dragged = editor.dragging.get();
    if (!dragged || dragged === id) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDrop(dropSide(event));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const dragged = editor.dragging.get();
    const side = dropSide(event);
    setDrop(null);
    if (!dragged || dragged === id) return;
    event.preventDefault();
    event.stopPropagation();
    editor.dragging.set(null);
    editor.apply((raw) => {
      const spec = moveBlock(raw, dragged, parent, side === "after" ? index + 1 : index);
      return spec ? { spec } : null;
    });
  };

  return (
    <div
      ref={frame}
      data-block={id}
      className="relative min-w-0"
      onMouseOver={activate}
      onFocus={activate}
      onDragOver={onDragOver}
      onDragLeave={() => { setDrop(null); }}
      onDrop={onDrop}
    >
      {drop ? <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-foreground/40", drop === "before" ? "-top-1" : "-bottom-1")} /> : null}
      <BlockHandle id={id} type={type} frame={frame} />
      {children}
    </div>
  );
}
