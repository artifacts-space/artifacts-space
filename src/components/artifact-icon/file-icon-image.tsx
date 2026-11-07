"use client";

import { useState, type ReactNode } from "react";

import { fileUrl } from "@/lib/files/types";
import { cn } from "@/lib/utils";

interface FileIconImageProps {
  fileId: string;
  className: string;
  /** Shown instead when the image cannot load: deleted, or not readable by this viewer. */
  fallback: ReactNode;
}

/**
 * An uploaded image icon, through the same access-checked redirect as Image
 * elements (/api/files/<id>), so whoever can read the artifact sees it and
 * nobody else. Falls back quietly when the file is gone or not readable.
 */
export function FileIconImage({ fileId, className, fallback }: FileIconImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an access-checked redirect to R2, which next/image cannot optimize
    <img
      src={fileUrl(fileId)}
      alt=""
      aria-hidden
      decoding="async"
      onError={() => { setFailed(true); }}
      className={cn("shrink-0 rounded-md object-cover", className)}
    />
  );
}
