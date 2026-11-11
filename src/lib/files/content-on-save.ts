import { siteOrigin } from "@/lib/site-origin";

import { relativeFileLinks } from "./media-rules";
import { fileRefsInContent } from "./refs";

/** This site's origin, or null where none is configured (tests); file links are then saved as sent. */
function ownOrigin(): string | null {
  try {
    return siteOrigin();
  } catch {
    return null;
  }
}

/**
 * Markdown that names this site's files absolutely (an agent re-saving the
 * Markdown version), saved in the relative form the editor and read view
 * show as media (relativeFileLinks). Other formats, and saves without
 * content, pass through unchanged.
 */
export function withRelativeFileLinks<T extends { content?: string | undefined }>(kind: string, input: T, origin: string | null = ownOrigin()): T {
  if (kind !== "markdown" || input.content === undefined || origin === null) return input;
  return { ...input, content: relativeFileLinks(input.content, origin) };
}

/**
 * A ui spec whose file ids are all written plainly. JSON may spell an id
 * with escapes (`"2\\u0061d2…"` for `"2ad2…"`), which reads as the same id but is not the
 * same text, and pruning checks content as text (icon-cleanup.ts). Such a
 * spec is saved re-serialized, compact or two-space indented as it came;
 * every other spec is saved exactly as sent.
 */
export function withPlainUiFileRefs(content: string): string {
  const refs = fileRefsInContent("ui", content);
  const text = content.toLowerCase();
  if (refs.every((fileId) => text.includes(fileId))) return content;
  return JSON.stringify(JSON.parse(content), null, content.includes("\n") ? 2 : undefined);
}

/** Content as a save stores it: Markdown with this site's file links relative, and ui specs with plain file ids. */
export function contentForSave<T extends { content?: string | undefined }>(kind: string, input: T, origin: string | null = ownOrigin()): T {
  if (input.content === undefined) return input;
  if (kind === "ui") return { ...input, content: withPlainUiFileRefs(input.content) };
  return withRelativeFileLinks(kind, input, origin);
}
