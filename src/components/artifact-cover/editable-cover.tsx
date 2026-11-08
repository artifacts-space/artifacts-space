"use client";

import { IconArrowsVertical, IconPhoto, IconTrash } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { parseArtifactCover, withCoverPosition } from "@/lib/covers/cover";
import { positionAfterDrag, positionAfterKey } from "@/lib/covers/reposition";

import { CoverArt } from "./cover-art";
import { CoverFrame } from "./cover-frame";
import { CoverPicker } from "./cover-picker";
import { useCoverSave } from "./use-cover-save";

const controlClass = "h-7 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70";

interface EditableCoverProps {
  publicId: string;
  /** The latest saved cover. */
  cover: string | null;
}

/** Moves focus to the reposition slider when it appears, so the arrow keys work at once. A stable function, so React calls it once per mount. */
function focusOnMount(node: HTMLElement | null) {
  // After the frame: the button that started repositioning finishes its own pointer handling first.
  if (node) requestAnimationFrame(() => { node.focus(); });
}

interface DragStart {
  pointerId: number;
  y: number;
  position: number;
}

/** Reposition mode: drag the image or use the keys, then save or cancel. */
function useReposition(onSave: (position: number) => Promise<void>) {
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<DragStart | null>(null);
  const [draft, setDraft] = useState<number | null>(null);

  function frameOf(target: HTMLElement) {
    const image = imageRef.current;
    return { frameWidth: target.clientWidth, frameHeight: target.clientHeight, naturalWidth: image?.naturalWidth ?? 0, naturalHeight: image?.naturalHeight ?? 0 };
  }

  const handlers = {
    onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
      if (draft === null) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, y: event.clientY, position: draft };
    },
    onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const start = drag.current;
      if (start?.pointerId !== event.pointerId) return;
      setDraft(positionAfterDrag(start.position, event.clientY - start.y, frameOf(event.currentTarget)));
    },
    onPointerUp() { drag.current = null; },
    onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
      if (draft === null) return;
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        if (event.key === "Enter") void onSave(draft);
        setDraft(null);
        return;
      }
      const next = positionAfterKey(draft, event.key, event.shiftKey);
      if (next === null) return;
      event.preventDefault();
      setDraft(next);
    },
  };

  return { imageRef, draft, setDraft, handlers };
}

/**
 * The cover on an artifact's page, for people who may edit it: Change (a
 * gradient or an uploaded image), Reposition (image covers: drag, or the
 * arrow keys, then Save), and Remove. The controls show on hover or focus,
 * and always on touch screens. Saves go through the same edit path and
 * approval rule as a title change. Without a cover it renders nothing; "Add
 * cover" sits with the icon and theme controls above the title.
 */
export function EditableCover({ publicId, cover: initial }: EditableCoverProps) {
  const { cover, saving, save } = useCoverSave(publicId, initial);
  const reposition = useReposition(async (position) => { await save(withCoverPosition(cover, position)); });
  const parsed = parseArtifactCover(cover);
  if (!parsed) return null;
  const { draft } = reposition;
  const repositioning = draft !== null;

  function startReposition() {
    if (parsed?.type !== "image") return;
    reposition.setDraft(parsed.position);
  }

  return (
    <CoverFrame>
      <CoverArt cover={cover} {...(repositioning ? { position: draft } : {})} imageRef={reposition.imageRef} />
      {repositioning ? (
        <>
          <div
            role="slider"
            tabIndex={0}
            ref={focusOnMount}
            aria-label="Cover position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={draft}
            aria-valuetext={`${String(draft)}% from the top`}
            className="absolute inset-0 flex cursor-grab touch-none items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:cursor-grabbing"
            {...reposition.handlers}
          >
            <p className="pointer-events-none rounded-lg bg-background/85 px-3 py-1.5 text-sm text-foreground backdrop-blur">Drag the image, or use the arrow keys</p>
          </div>
          <div className="absolute inset-x-0 bottom-3 mx-auto flex w-full max-w-[960px] justify-end gap-1.5 px-6">
            <Button type="button" variant="outline" size="sm" className={controlClass} onClick={() => { reposition.setDraft(null); }}>Cancel</Button>
            <Button type="button" size="sm" className="h-7" onClick={() => { void save(withCoverPosition(cover, draft)); reposition.setDraft(null); }}>Save position</Button>
          </div>
        </>
      ) : (
        <div className="absolute inset-x-0 bottom-3 mx-auto flex w-full max-w-[960px] justify-end gap-1.5 px-6 opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-within/cover:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100">
          <CoverPicker
            value={cover}
            onChange={(next) => void save(next)}
            disabled={saving}
            allowUpload
            trigger={<Button type="button" variant="outline" size="sm" className={controlClass}><IconPhoto /> Change cover</Button>}
          />
          {parsed.type === "image" ? (
            <Button type="button" variant="outline" size="sm" className={controlClass} disabled={saving} onClick={startReposition}><IconArrowsVertical /> Reposition</Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className={controlClass} disabled={saving} onClick={() => void save(null)} aria-label="Remove cover"><IconTrash /> Remove</Button>
        </div>
      )}
    </CoverFrame>
  );
}
