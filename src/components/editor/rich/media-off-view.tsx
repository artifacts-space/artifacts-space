"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";

import { cn } from "@/lib/utils";

import { readMediaAttrs } from "./media-markdown";

/**
 * Media written into the Markdown of a block that can't show it, such as a
 * ui artifact's Markdown block. The editor keeps it exactly as written and
 * says what readers see: its name, not the file.
 */
export function MediaOffView({ node, selected }: ReactNodeViewProps) {
  const attrs = readMediaAttrs(node.attrs);
  const name = attrs.alt || attrs.src || "media";
  return (
    <NodeViewWrapper as="div" data-media-off="" contentEditable={false} className={cn("my-4 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground", selected && "ring-2 ring-ring")}>
      <span className="text-foreground">{name}</span>. Media doesn’t show in this block; readers see its name. It stays in the Markdown as written.
    </NodeViewWrapper>
  );
}
