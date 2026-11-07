import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import { parseArtifactIcon } from "@/lib/artifact-icons";
import type { ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

import { FileIconImage } from "./file-icon-image";
import { tablerIconComponents } from "./tabler-icons";

/** Where the icon sits: beside list text, in a small header, or large above a page title. */
export type ArtifactIconSize = "text" | "heading" | "page";

const emojiSizes: Record<ArtifactIconSize, string> = {
  text: "text-md leading-none",
  heading: "text-2xl leading-none",
  page: "text-5xl leading-none sm:text-6xl",
};

const glyphSizes: Record<ArtifactIconSize, string> = {
  text: "size-4",
  heading: "size-6",
  page: "size-12 sm:size-14",
};

const imageSizes: Record<ArtifactIconSize, string> = {
  text: "size-4 rounded-sm",
  heading: "size-7",
  page: "size-14 sm:size-16 rounded-lg",
};

interface ArtifactIconProps {
  /** The stored icon: one emoji, "tabler:<name>", or "file:<uuid>". */
  icon: string | null | undefined;
  /** The format, for the fallback format icon. Without it, no icon renders when there is none. */
  kind?: ArtifactKind | undefined;
  size?: ArtifactIconSize;
  className?: string | undefined;
}

/**
 * An artifact's page icon: the emoji as text, the Tabler icon in
 * currentColor, or an uploaded image through the access-checked file URL. Falls back to the format icon when `kind` is given. Never
 * renders stored text as HTML. Decorative: the title beside it names it.
 */
export function ArtifactIcon({ icon, kind, size = "text", className }: ArtifactIconProps) {
  const parsed = parseArtifactIcon(icon);
  if (parsed?.type === "file") {
    return <FileIconImage fileId={parsed.fileId} className={cn(imageSizes[size], className)} fallback={<KindFallback kind={kind} size={size} className={className} />} />;
  }
  if (parsed?.type === "emoji") {
    return <span aria-hidden className={cn("inline-block shrink-0 select-none", emojiSizes[size], className)}>{parsed.emoji}</span>;
  }
  if (parsed?.type === "tabler") {
    const Glyph = tablerIconComponents[parsed.name];
    return <Glyph aria-hidden className={cn("shrink-0", glyphSizes[size], className)} stroke={size === "page" ? 1.5 : 2} />;
  }
  return <KindFallback kind={kind} size={size} className={className} />;
}

/** The format icon, or nothing without a format. */
function KindFallback({ kind, size, className }: { kind: ArtifactKind | undefined; size: ArtifactIconSize; className: string | undefined }) {
  if (!kind) return null;
  const Fallback = kindIcons[kind];
  return <Fallback aria-hidden className={cn("shrink-0", glyphSizes[size], kindColors[kind], className)} />;
}

/** True when the artifact has an icon of its own (not the format fallback). */
export function hasOwnIcon(icon: string | null | undefined): boolean {
  return parseArtifactIcon(icon) !== null;
}
