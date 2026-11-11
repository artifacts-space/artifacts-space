"use client";

import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import type { DragEvent, Ref } from "react";

import { cn } from "@/lib/utils";

/** Where a handle sits, relative to the editor: centred on the block's first line, just left of it. */
export interface HandlePlace {
  pos: number;
  /** The middle of the block's first line. */
  middle: number;
  /** The left edge of the block (or of its list, for a list item). */
  left: number;
  /** How far left of the editor the handle may reach before something cuts it off. */
  room: number;
}

interface BlockHandleProps {
  place: HandlePlace;
  /** Touch screens: only the grip, always faintly shown. */
  touch: boolean;
  /** The block's menu is open: the handle stays shown. */
  open: boolean;
  /** Shown because the pointer is over the block. */
  shown: boolean;
  gripRef?: Ref<HTMLButtonElement> | undefined;
  onOpen: (grip: HTMLButtonElement) => void;
  onAdd: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}

const buttonClass =
  "flex h-6 w-[22px] items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4";

/** The width of the handle: "+" and the grip on a desktop, the grip alone on touch. */
function handleWidth(touch: boolean, compact: boolean): number {
  if (touch) return 24;
  return compact ? 22 : 46;
}

/**
 * The handle beside a block: "+" adds a line under it, and the ⋮⋮ grip opens
 * the block's menu or drags the block. It shows on hover, stays while the
 * menu is open, and is always faintly shown on touch screens. When the page
 * leaves too little room on the left, only the grip shows.
 */
export function BlockHandle({ place, touch, open, shown, gripRef, onOpen, onAdd, onDragStart, onDragEnd }: BlockHandleProps) {
  const compact = touch || place.room < 50;
  const width = handleWidth(touch, compact);
  const height = touch ? 32 : 24;
  const left = Math.max(place.left - width - 2, -place.room);
  return (
    <div
      data-slot="block-handle"
      data-block-pos={place.pos}
      style={{ top: place.middle - height / 2, left, height }}
      className={cn(
        "absolute z-10 flex items-center gap-0.5 transition-opacity duration-150 motion-reduce:transition-none",
        open || shown ? "opacity-100" : touch ? "opacity-55" : "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100",
      )}
    >
      {compact ? null : (
        <button type="button" tabIndex={-1} aria-label="Add a line below" onClick={onAdd} className={buttonClass}>
          <IconPlus />
        </button>
      )}
      <button
        ref={gripRef}
        type="button"
        aria-label="Block actions"
        aria-haspopup="menu"
        aria-expanded={open}
        draggable={!touch}
        onClick={(event) => { onOpen(event.currentTarget); }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={cn(buttonClass, "cursor-grab active:cursor-grabbing", touch && "h-8 w-6")}
      >
        <IconGripVertical />
      </button>
    </div>
  );
}
