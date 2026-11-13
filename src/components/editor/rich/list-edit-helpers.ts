import type { JSONContent } from "@tiptap/core";

import { parseMarkdown, serializeMarkdown, type SourceMap } from "./markdown-roundtrip";

/*
 * Test helpers for list edits: load Markdown, change the editor content as
 * a person would, and save.
 */

/** Loads Markdown, applies one change to the editor content, and saves. */
export function edit(markdown: string, change: (doc: JSONContent) => void): string {
  const loaded = parseMarkdown(markdown);
  const doc = structuredClone(loaded.doc);
  change(doc);
  return serializeMarkdown(doc, loaded.source);
}

/** Loads Markdown, applies one change, and returns the edited content with what was saved. */
export function editAndSave(markdown: string, change: (doc: JSONContent) => void): { doc: JSONContent; saved: string } {
  const loaded = parseMarkdown(markdown);
  const doc = structuredClone(loaded.doc);
  change(doc);
  return { doc, saved: serializeMarkdown(doc, loaded.source) };
}

/**
 * The content as the round trip's own writer saves it when an edited list
 * has no items to be written over: the same save with the item maps taken
 * away, which is how lists were saved before item maps existed.
 */
export function wholeListWriting(doc: JSONContent, source: SourceMap): string {
  const blocks = source.blocks.map((block) => ({ key: block.key, nodeCount: block.nodeCount, text: block.text, after: block.after }));
  return serializeMarkdown(structuredClone(doc), { ...source, blocks });
}

/** Loads Markdown, applies one change, and returns what was saved beside the whole-list writing of the same edit. */
export function editBothWays(markdown: string, change: (doc: JSONContent) => void): { doc: JSONContent; saved: string; whole: string } {
  const loaded = parseMarkdown(markdown);
  const doc = structuredClone(loaded.doc);
  change(doc);
  return { doc, saved: serializeMarkdown(doc, loaded.source), whole: wholeListWriting(doc, loaded.source) };
}

/** Every node in document order. */
function nodes(node: JSONContent): JSONContent[] {
  return [node, ...(node.content ?? []).flatMap((child) => nodes(child))];
}

/** A node's text, with its children's text joined. */
export function textOf(node: JSONContent): string {
  return nodes(node).map((child) => child.text ?? "").join("");
}

/** The first node of `type` whose text includes `words`. */
export function find(doc: JSONContent, type: string, words: string): JSONContent {
  const found = nodes(doc).find((node) => node.type === type && textOf(node).includes(words));
  if (!found) throw new Error(`No ${type} with "${words}"`);
  return found;
}

/** Replaces a node's text. */
export function setText(node: JSONContent, text: string) {
  node.content = [{ type: "text", text }];
}

/** Ticks or clears the task box of the first task item with `words`. */
export function tick(doc: JSONContent, words: string, checked = true) {
  const item = find(doc, "taskItem", words);
  item.attrs = { ...item.attrs, checked };
}

/** A paragraph node with `text`, as the editor writes one. */
export function paragraph(text: string): JSONContent {
  return { type: "paragraph", attrs: { color: null, background: null }, content: [{ type: "text", text }] };
}

/** The editor content the saved Markdown loads as, for comparing with what was edited. */
export function reloaded(saved: string): JSONContent {
  return parseMarkdown(saved).doc;
}
