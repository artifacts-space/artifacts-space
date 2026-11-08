"use client";

import { IconPhoto } from "@tabler/icons-react";

import { coverGradients } from "@/lib/covers/gradients";
import { cn } from "@/lib/utils";

import { useCoverSave } from "./use-cover-save";

/** A gradient for a new cover, different each time, as Notion does. Change cover picks another. */
function randomGradientId(): string {
  const index = Math.floor(Math.random() * coverGradients.length);
  return (coverGradients[index] ?? coverGradients[0]).id;
}

/**
 * "Add cover" in an artifact's title area, for people who may edit it and
 * only while it has no cover. It shows on hover or focus (always on touch
 * screens) and adds a gradient cover at once; the cover's own controls then
 * change, reposition, or remove it.
 */
export function AddCoverButton({ publicId }: { publicId: string }) {
  const { saving, save } = useCoverSave(publicId, null);
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => void save(randomGradientId())}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 pointer-coarse:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        saving && "opacity-60",
      )}
    >
      <IconPhoto aria-hidden className="size-4" /> Add cover
    </button>
  );
}
