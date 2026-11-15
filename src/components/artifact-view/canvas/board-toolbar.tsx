"use client";

import { IconFrame, IconMinus, IconPlus } from "@tabler/icons-react";

import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { zoomPercent } from "@/lib/canvas/view-rules";

import { frameSizeLabel, type BoardFrame } from "./canvas-frame";

interface BoardToolbarProps {
  frames: readonly BoardFrame[];
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onActualSize: () => void;
  onFit: () => void;
  onShowFrame: (frame: BoardFrame) => void;
  /**
   * Called when the Frames menu closes. It moves focus to the frame just
   * picked and returns true, or returns false when none was picked, and the
   * menu then returns focus to its button.
   */
  focusPickedFrame: () => boolean;
}

/**
 * The board's controls, floating in its lower right corner: a menu that goes
 * to any frame without a pointer, zoom out, the current zoom (press for
 * 100%), zoom in, and Fit. Every control is a real button and its own tab
 * stop, so the bar is a labelled group, not a toolbar with arrow-key focus.
 */
export function BoardToolbar({ frames, zoom, onZoomIn, onZoomOut, onActualSize, onFit, onShowFrame, focusPickedFrame }: BoardToolbarProps) {
  return (
    <div
      role="group"
      aria-label="Canvas view"
      data-canvas-toolbar=""
      data-comment-skip=""
      className="absolute right-3 bottom-3 z-10 flex cursor-default items-center gap-0.5 rounded-xl border border-card-edge bg-card p-1 text-card-foreground shadow-md"
    >
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
          <IconFrame aria-hidden />
          Frames
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-64" finalFocus={() => !focusPickedFrame()}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-1.5 text-xs">Go to frame</DropdownMenuLabel>
            {frames.map((frame) => (
              <DropdownMenuItem key={frame.id} onClick={() => { onShowFrame(frame); }}>
                <span className="min-w-0 flex-1 truncate">{frame.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{frameSizeLabel(frame)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
      <IconButton label="Zoom out" onClick={onZoomOut}>
        <IconMinus />
      </IconButton>
      <Button type="button" variant="ghost" size="sm" className="min-w-14 tabular-nums" aria-label={`Zoom ${zoomPercent(zoom)}. Show at 100%`} onClick={onActualSize} data-canvas-zoom-level="">
        {zoomPercent(zoom)}
      </Button>
      <IconButton label="Zoom in" onClick={onZoomIn}>
        <IconPlus />
      </IconButton>
      <Button type="button" variant="ghost" size="sm" onClick={onFit}>
        Fit
      </Button>
    </div>
  );
}
