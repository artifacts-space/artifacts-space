import type { Node as PMNode } from "@tiptap/pm/model";

import { buildBlockAnchor, normalizeBlockText, type AnchorBlock, type BlockAnchor } from "@/lib/block-links/anchor-rules";

import { MEDIA_NODE, mediaFileId, readMediaAttrs } from "../media-markdown";
import { blockText, documentBlocks } from "./block-target";

/** The uploaded files a block shows. */
function fileIdsIn(node: PMNode): string[] {
  const ids: string[] = [];
  const add = (child: PMNode) => {
    if (child.type.name !== MEDIA_NODE) return;
    const id = mediaFileId(readMediaAttrs(child.attrs));
    if (id) ids.push(id.toLowerCase());
  };
  add(node);
  node.descendants((child) => { add(child); });
  return ids;
}

/** The document's blocks as links see them (anchor-rules.ts), with each block's position. */
export function anchorBlocks(doc: PMNode): { pos: number; block: AnchorBlock }[] {
  return documentBlocks(doc).map(({ pos, node }) => ({
    pos,
    block: { text: normalizeBlockText(blockText(node)), fileIds: fileIdsIn(node), topIndex: doc.resolve(pos).index(0) },
  }));
}

/** The link anchor for the block that starts at `pos`, or null when no block starts there. */
export function anchorForBlockAt(doc: PMNode, pos: number): BlockAnchor | null {
  const blocks = anchorBlocks(doc);
  const index = blocks.findIndex((entry) => entry.pos === pos);
  return index < 0 ? null : buildBlockAnchor(blocks.map((entry) => entry.block), index);
}
