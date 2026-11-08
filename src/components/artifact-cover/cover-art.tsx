"use client";

import { useState, type Ref } from "react";

import { parseArtifactCover } from "@/lib/covers/cover";
import { coverGradientCss } from "@/lib/covers/gradients";
import { fileUrl } from "@/lib/files/types";
import { cn } from "@/lib/utils";

interface CoverArtProps {
  /** The stored cover. Null draws nothing. */
  cover: string | null;
  /** Overrides the stored focal point while an editor repositions the image. */
  position?: number;
  className?: string;
  imageRef?: Ref<HTMLImageElement>;
}

/**
 * The picture of a cover, filling its parent: a gradient made of theme
 * custom properties (so it takes the theme of the ThemeScope around it), or
 * an uploaded image through the access-checked file redirect, so whoever can
 * read the artifact sees it and nobody else. An image that cannot load falls
 * back to a quiet muted fill; the box keeps its size either way.
 */
export function CoverArt({ cover, position, className, imageRef }: CoverArtProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const parsed = parseArtifactCover(cover);
  if (!parsed) return null;
  if (parsed.type === "gradient") {
    return <div aria-hidden data-cover-gradient={parsed.gradient.id} className={cn("absolute inset-0", className)} style={{ backgroundImage: coverGradientCss(parsed.gradient) }} />;
  }
  const src = fileUrl(parsed.fileId);
  if (failedSrc === src) return <div aria-hidden data-cover-image="unavailable" className={cn("absolute inset-0 bg-muted", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize
    <img
      ref={imageRef}
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      data-cover-image="file"
      onError={() => { setFailedSrc(src); }}
      className={cn("absolute inset-0 size-full object-cover select-none", className)}
      style={{ objectPosition: `50% ${String(position ?? parsed.position)}%` }}
    />
  );
}
