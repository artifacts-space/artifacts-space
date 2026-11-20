"use client";

import { IconArrowsVertical, IconPhoto, IconTrash } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { parseArtifactCover, withCoverPosition } from "@/lib/covers/cover";
import { positionAfterDrag, positionAfterKey } from "@/lib/covers/reposition";
import { pageColumnClass } from "@/lib/page-width/rules";
import { cn } from "@/lib/utils";

import { CoverArt } from "./cover-art";
import { CoverFrame } from "./cover-frame";
import { CoverPicker } from "./cover-picker";
import { useCoverSave } from "./use-cover-save";

/**
 * The controls sit on the picture, so their surface is solid in both modes: readable over a white, black, or busy
 * image. The outline button's own dark surface is 30% opaque, and a blurred one let a high-contrast image through.
 */
const controlClass = "h-7 border-border bg-background text-foreground shadow-sm hover:bg-muted dark:border-border dark:bg-background dark:hover:bg-muted";
/** On phones the controls are icons (their names stay for screen readers), so they never run under a page icon on the cover's left. Remove has its own fuller name, "Remove cover". */
const phoneLabel = "max-sm:sr-only";

interface EditableCoverProps {
  publicId: string;
  /** The latest saved cover. */
  cover: string | null;
  /** Lines the controls up with a full-width page column. */
  fullWidth: boolean;
  /** The page has an icon, which the page draws across the cover's lower edge. */
  hasIcon: boolean;
}

/**
 * What takes the cover's place from the moment it is removed until the
 * server's page arrives: the page around it was laid out for a cover (no
 * space above the heading, the icon pulled up across the cover's edge), and
 * without this the icon would sit under the header until then. Each height
 * puts the title, and so everything under it, exactly where the page
 * without a cover has it, so the page does not move when that page takes
 * over. Without an icon that is what the heading's space is short by under
 * a cover. With one it is the heading's usual space plus what the icon's
 * box is pulled up by, less what that box is taller than the icon's row in
 * the page without a cover (4 px on phones, 8 px from sm: the icon is
 * centred in it); the icon itself then settles 2 px (4 px from sm) lower.
 */
function RemovedCoverSpace({ hasIcon }: { hasIcon: boolean }) {
  return <div data-cover-removed aria-hidden className={hasIcon ? "h-19 sm:h-24" : "h-4 sm:h-6"} />;
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
 * approval rule as a title change. A removed cover is gone at once, and its
 * place keeps the page's spacing (RemovedCoverSpace) until the server's page
 * arrives; "Add cover" sits with the icon and theme controls above the title.
 */
export function EditableCover({ publicId, cover: initial, fullWidth, hasIcon }: EditableCoverProps) {
  const { cover, saving, save } = useCoverSave(publicId, initial);
  const reposition = useReposition(async (position) => { await save(withCoverPosition(cover, position)); });
  const parsed = parseArtifactCover(cover);
  if (!parsed) return cover === null ? <RemovedCoverSpace hasIcon={hasIcon} /> : null;
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
            <p className="pointer-events-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground shadow-sm">Drag the image, or use the arrow keys</p>
          </div>
          <div className={cn("absolute inset-x-0 bottom-3 mx-auto flex w-full justify-end gap-1.5", pageColumnClass(fullWidth))}>
            <Button type="button" variant="outline" size="sm" className={controlClass} onClick={() => { reposition.setDraft(null); }}>Cancel</Button>
            <Button type="button" size="sm" className="h-7" onClick={() => { void save(withCoverPosition(cover, draft)); reposition.setDraft(null); }}>Save position</Button>
          </div>
        </>
      ) : (
        <div className={cn("absolute inset-x-0 bottom-3 mx-auto flex w-full justify-end gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-within/cover:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100", pageColumnClass(fullWidth))}>
          <CoverPicker
            value={cover}
            onChange={(next) => void save(next)}
            disabled={saving}
            allowUpload
            trigger={<Button type="button" variant="outline" size="sm" className={controlClass}><IconPhoto /> <span className={phoneLabel}>Change cover</span></Button>}
          />
          {parsed.type === "image" ? (
            <Button type="button" variant="outline" size="sm" className={controlClass} disabled={saving} onClick={startReposition}><IconArrowsVertical /> <span className={phoneLabel}>Reposition</span></Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className={controlClass} disabled={saving} onClick={() => void save(null)} aria-label="Remove cover"><IconTrash /> <span className="max-sm:hidden">Remove</span></Button>
        </div>
      )}
    </CoverFrame>
  );
}
