import type { JSONContent } from "@tiptap/core";
import Markdown from "react-markdown";

import { markdownSyntaxPlugins } from "@/components/artifact-view/markdown-syntax";

import { boxShape, treeShape, type TreeNode } from "./comment-shape";

/**
 * The Markdown tree the comment thread renders `markdown` from: the same
 * renderer (react-markdown) with the same syntax plugins as MarkdownView,
 * read just before it turns into HTML. @mentions are left out: they only
 * decorate text.
 *
 * It calls react-markdown's `Markdown` as a plain function, outside React.
 * That works only while `Markdown` uses no hooks; thread-reading.test.ts
 * fails when an upgrade breaks it.
 */
export function threadTree(markdown: string): TreeNode[] {
  const seen: { root: TreeNode | null } = { root: null };
  const capture = () => (root: TreeNode) => {
    seen.root = root;
  };
  Markdown({ children: markdown, remarkPlugins: [...markdownSyntaxPlugins, capture], skipHtml: true });
  return seen.root?.children ?? [];
}

/**
 * True when the comment thread shows `markdown` as the box shows `nodes`:
 * the same blocks, the same marks, and the same text (comment-shape.ts).
 */
export function threadShows(markdown: string, nodes: readonly JSONContent[]): boolean {
  return treeShape(threadTree(markdown)) === boxShape(nodes);
}
