import { normalizeBlockText, type AnchorBlock } from "@/lib/block-links/anchor-rules";

/*
 * The blocks of a rendered Markdown artifact, read from the page: the read
 * view (`.artifact-prose`) or the editor (`.ProseMirror`). The list matches
 * the editor's (block-menu/block-links.ts): each top-level block that is not
 * a list, then every list item, in document order.
 */

const FILE_URL = /\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** One block on the page and how links see it. */
export interface DomBlock {
  element: HTMLElement;
  block: AnchorBlock;
}

/** The element that holds the artifact's blocks inside `container`: the editor's document, else the read view. */
export function blockRoot(container: Element): HTMLElement | null {
  return container.querySelector<HTMLElement>(".ProseMirror") ?? container.querySelector<HTMLElement>(".artifact-prose");
}

/** The uploaded files an element shows or links to. */
function fileIdsIn(element: HTMLElement): string[] {
  const ids = new Set<string>();
  for (const media of element.querySelectorAll("[src], [href]")) {
    const match = FILE_URL.exec(media.getAttribute("src") ?? media.getAttribute("href") ?? "");
    if (match?.[1]) ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

/** Every block under `root`, in document order. */
export function domBlocks(root: HTMLElement): DomBlock[] {
  const tops = [...root.children];
  return [...root.querySelectorAll<HTMLElement>(":scope > :not(ul, ol), li")].map((element) => ({
    element,
    block: {
      text: normalizeBlockText(element.textContent),
      fileIds: fileIdsIn(element),
      topIndex: tops.findIndex((top) => top.contains(element)),
    },
  }));
}

/** The block a node on the page sits in: its innermost list item, else its top-level block. Null outside the blocks, or on a list's own padding. */
export function blockElementAt(root: HTMLElement, node: Node): HTMLElement | null {
  const start = node instanceof Element ? node : node.parentElement;
  const item = start?.closest("li");
  if (item && root.contains(item)) return item;
  const top = [...root.children].find((child) => child.contains(node));
  if (!(top instanceof HTMLElement) || top.matches("ul, ol")) return null;
  return top;
}
