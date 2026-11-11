"use client";

import { IconLink } from "@tabler/icons-react";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { blockLink, buildBlockAnchor } from "@/lib/block-links/anchor-rules";

import { copyBlockLink } from "./copy-block-link";
import { blockElementAt, blockRoot, domBlocks } from "./dom-blocks";

interface OpenMenu {
  link: string;
  x: number;
  y: number;
}

/** Right-clicks that keep the browser's menu: touch, selected text, links, media, and fields. */
function keepsNativeMenu(event: MouseEvent<HTMLElement>): boolean {
  const native = event.nativeEvent;
  if (native instanceof PointerEvent && native.pointerType === "touch") return true;
  if (window.getSelection()?.isCollapsed === false) return true;
  return event.target instanceof Element && event.target.closest("a, button, input, textarea, select, video, audio, iframe") !== null;
}

/** The link to the block under a right-click, or null when it was not on a block. */
function linkAt(container: HTMLElement, target: EventTarget, publicId: string): string | null {
  const root = blockRoot(container);
  if (!root || !(target instanceof Node)) return null;
  const element = blockElementAt(root, target);
  if (!element) return null;
  const blocks = domBlocks(root);
  const anchor = buildBlockAnchor(blocks.map((entry) => entry.block), blocks.findIndex((entry) => entry.element === element));
  return anchor ? blockLink(window.location.origin, publicId, anchor) : null;
}

/**
 * For readers of a Markdown artifact (and editors before editing loads):
 * right-clicking a block offers one thing, Copy link to block. Right-clicks
 * on selected text, links, and media, and long presses on touch screens,
 * keep the browser's own menu.
 */
export function ReaderBlockMenu({ publicId, enabled, children }: { publicId: string; enabled: boolean; children: ReactNode }) {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const container = useRef<HTMLDivElement>(null);
  if (!enabled) return children;

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!container.current || keepsNativeMenu(event)) return;
    const link = linkAt(container.current, event.target, publicId);
    if (!link) return;
    event.preventDefault();
    setMenu({ link, x: event.clientX, y: event.clientY });
  };

  const point = menu ? { getBoundingClientRect: () => new DOMRect(menu.x, menu.y, 0, 0) } : null;
  return (
    <div ref={container} onContextMenu={onContextMenu}>
      {children}
      <DropdownMenu open={menu !== null} onOpenChange={(open) => { if (!open) setMenu(null); }}>
        {point ? (
          <DropdownMenuContent anchor={point} align="start" className="w-auto min-w-48">
            <DropdownMenuItem onClick={() => { if (menu) copyBlockLink(menu.link); }}>
              <IconLink /> Copy link to block
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
    </div>
  );
}
