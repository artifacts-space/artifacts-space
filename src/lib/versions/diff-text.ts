import type { ArtifactKind } from "@/lib/artifact-types";

/** Formats whose source is JSON, compared pretty-printed so a one-line spec still diffs line by line. */
const jsonKinds: ReadonlySet<ArtifactKind> = new Set(["json", "ui"]);

/**
 * The text a version diff compares. JSON and ui specs are parsed and
 * pretty-printed with two-space indents; content that does not parse, and
 * every other format, is compared as written.
 */
export function diffableContent(kind: ArtifactKind, content: string): string {
  if (!jsonKinds.has(kind)) return content;
  try {
    return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
  } catch {
    return content;
  }
}
