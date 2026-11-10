import { siteOrigin } from "@/lib/site-origin";

import { relativeFileLinks } from "./media-rules";

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
