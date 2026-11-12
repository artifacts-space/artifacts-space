import {
  IconAlignLeft,
  IconBraces,
  IconCode,
  IconFileText,
  IconLayoutDashboard,
  IconPaperclip,
  IconSitemap,
  IconTable,
  IconVectorBezier2,
} from "@tabler/icons-react";

import type { FormatKind } from "@/lib/artifact-formats";
import { artifactKinds, type ArtifactKind } from "@/lib/artifact-types";

/** Formats people can pick, in picker order. Follows `artifactKinds`. */
export const kinds: ArtifactKind[] = [...artifactKinds];

export const kindIcons: Record<FormatKind, typeof IconFileText> = {
  markdown: IconFileText,
  code: IconCode,
  text: IconAlignLeft,
  json: IconBraces,
  csv: IconTable,
  svg: IconVectorBezier2,
  mermaid: IconSitemap,
  ui: IconLayoutDashboard,
  file: IconPaperclip,
};

/** Text color class per format. The colors are tokens in globals.css. */
export const kindColors: Record<FormatKind, string> = {
  markdown: "text-kind-markdown",
  code: "text-kind-code",
  text: "text-kind-text",
  json: "text-kind-json",
  csv: "text-kind-csv",
  svg: "text-kind-svg",
  mermaid: "text-kind-mermaid",
  ui: "text-kind-ui",
  file: "text-kind-file",
};

/**
 * Whether the header shows the format as a chip under the summary. Markdown
 * is what a page is unless it says otherwise, so "Markdown" there tells a
 * reader nothing; a sheet, code, an interface, or a diagram says what the
 * page holds. Changing the format stays in the More menu either way.
 */
export function showsFormatChip(kind: ArtifactKind): boolean {
  return kind !== "markdown";
}
