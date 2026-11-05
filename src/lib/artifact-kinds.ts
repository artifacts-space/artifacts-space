import { IconAlignLeft, IconBraces, IconCode, IconFileText } from "@tabler/icons-react";

import type { ArtifactKind } from "@/lib/artifact-types";

export const kinds: ArtifactKind[] = ["markdown", "code", "text", "json"];

export const kindIcons: Record<ArtifactKind, typeof IconFileText> = {
  markdown: IconFileText,
  code: IconCode,
  text: IconAlignLeft,
  json: IconBraces,
};

/** Text color class per format. The colors are tokens in globals.css. */
export const kindColors: Record<ArtifactKind, string> = {
  markdown: "text-kind-markdown",
  code: "text-kind-code",
  text: "text-kind-text",
  json: "text-kind-json",
};
