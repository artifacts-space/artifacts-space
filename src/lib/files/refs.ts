import { isPlainObject } from "@/lib/ui/json-walk";

import { markdownFileRefs } from "./media-rules";

/** ui components that point at an uploaded file through their `file` prop. */
export const fileComponentTypes: ReadonlySet<string> = new Set(["Image", "File"]);

/** Most distinct files a ui spec's or a canvas's content, or one attach call, may name. A Markdown save has its own cap (maxMarkdownFileRefs in limit-rules.ts). */
export const maxFileRefs = 50;

function refsInElements(elements: unknown): string[] {
  if (!isPlainObject(elements)) return [];
  const ids: string[] = [];
  for (const element of Object.values(elements)) {
    if (!isPlainObject(element) || typeof element.type !== "string" || !fileComponentTypes.has(element.type)) continue;
    const props = element.props;
    if (isPlainObject(props) && typeof props.file === "string") ids.push(props.file.trim().toLowerCase());
  }
  return ids;
}

/** The file ids in every frame of a canvas: each frame's `spec` is a ui spec. */
function refsInFrames(frames: unknown): string[] {
  if (!Array.isArray(frames)) return [];
  return frames.flatMap((frame: unknown) => (isPlainObject(frame) && isPlainObject(frame.spec) ? refsInElements(frame.spec.elements) : []));
}

/** Formats whose content can point at uploaded files. */
export const contentRefKinds: readonly string[] = ["ui", "markdown", "canvas"];

/**
 * The distinct file ids a piece of content points at: the `file` prop of
 * every Image and File element in a ui spec or in any frame of a canvas, and
 * every `/api/files/<id>` in Markdown (media and links; see media-rules.ts).
 * Other formats point at none. A spec or canvas that does not parse points at
 * none; validation reports it.
 */
export function fileRefsInContent(kind: string, content: string): string[] {
  if (kind === "markdown") return markdownFileRefs(content);
  if (kind !== "ui" && kind !== "canvas") return [];
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isPlainObject(parsed)) return [];
    return [...new Set(kind === "ui" ? refsInElements(parsed.elements) : refsInFrames(parsed.frames))];
  } catch {
    return [];
  }
}
