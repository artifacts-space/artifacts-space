"use client";

import { IconCode } from "@tabler/icons-react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";

/**
 * Markdown the editor keeps exactly as written (raw HTML, footnotes, images
 * inside text, link definitions). It shows as its source in a quiet box that can be edited
 * as text, so nothing is dropped or rewritten on save.
 */
export function RawBlockView({ node, updateAttributes, editor, selected }: ReactNodeViewProps) {
  const attr: unknown = node.attrs.source;
  const source = typeof attr === "string" ? attr : "";
  return (
    <NodeViewWrapper className="rich-raw-block" data-selected={selected ? "" : undefined}>
      <div contentEditable={false} className="flex items-center gap-1.5 px-3 pt-2 text-xs text-muted-foreground select-none">
        <IconCode aria-hidden className="size-3.5" />
        Kept as written
      </div>
      <textarea
        value={source}
        readOnly={!editor.isEditable}
        spellCheck={false}
        aria-label="Markdown kept as written"
        onChange={(event) => { updateAttributes({ source: event.target.value }); }}
        className="block w-full resize-none field-sizing-content bg-transparent px-3 pt-1 pb-2.5 font-mono text-base leading-6 text-foreground outline-none md:text-sm"
      />
    </NodeViewWrapper>
  );
}
