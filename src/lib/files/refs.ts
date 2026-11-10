import { isPlainObject } from "@/lib/ui/json-walk";

import { markdownFileRefs } from "./media-rules";

/** ui components that point at an uploaded file through their `file` prop. */
export const fileComponentTypes: ReadonlySet<string> = new Set(["Image", "File"]);

/** Most distinct files one artifact's content may use (ui Image and File elements, or files a Markdown save attaches). */
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

/** Formats whose content can point at uploaded files. */
export const contentRefKinds: readonly string[] = ["ui", "markdown"];

/**
 * The distinct file ids a piece of content points at: the `file` prop of
 * every Image and File element in a ui spec, and every `/api/files/<id>` in
 * Markdown (media and links; see media-rules.ts). Other formats point at
 * none. A ui spec that does not parse points at none; validation reports it.
 */
export function fileRefsInContent(kind: string, content: string): string[] {
  if (kind === "markdown") return markdownFileRefs(content);
  if (kind !== "ui") return [];
  try {
    const spec: unknown = JSON.parse(content);
    return isPlainObject(spec) ? [...new Set(refsInElements(spec.elements))] : [];
  } catch {
    return [];
  }
}
