"use client";

import { IconLoader2, IconPhotoUp } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";

import { uploadImageFile } from "@/components/artifact-icon/upload-tab";
import { prepareImage } from "@/components/images/prepare-image";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { FILE_PREFIX } from "@/lib/artifact-icons";
import { parseArtifactCover } from "@/lib/covers/cover";
import { coverGradientCss, coverGradients } from "@/lib/covers/gradients";
import { isCoverUploadAllowed } from "@/lib/files/cover-rules";
import { coverPrepareProfile, IMAGE_SOURCE_ACCEPT, imageSourceProblem } from "@/lib/images/prepare-rules";
import { iconGridMove } from "@/lib/icon-grid";
import { cn } from "@/lib/utils";

const COLUMNS = 4;
const RULE = "Any photo works. It is resized, and its location data removed. Wide images look best.";

interface CoverPickerProps {
  /** The stored cover, or null. */
  value: string | null;
  /** Called with the chosen cover (a gradient id or "file:<id>"), or null to remove it. The picker closes first. */
  onChange: (cover: string | null) => void;
  /** The button that opens the picker, as a Base UI render element. */
  trigger: React.ReactElement;
  disabled?: boolean;
  /** Offer "Upload an image" too. */
  allowUpload?: boolean;
  align?: "start" | "center" | "end";
}

/**
 * The gradients as one radio group: a single tab stop, arrow keys, Home, and
 * End move between swatches, and Enter or Space picks one.
 */
function GradientGrid({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(Math.max(0, coverGradients.findIndex((gradient) => gradient.id === selected)));

  function onKey(event: React.KeyboardEvent, index: number) {
    const next = iconGridMove(index, event.key, COLUMNS, coverGradients.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    cells.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Cover gradient" className="grid grid-cols-4 gap-2 p-3">
      {coverGradients.map((gradient, index) => (
        <button
          key={gradient.id}
          ref={(node) => { cells.current[index] = node; }}
          type="button"
          role="radio"
          aria-checked={gradient.id === selected}
          aria-label={gradient.name}
          title={gradient.name}
          tabIndex={index === active ? 0 : -1}
          autoFocus={index === active}
          onKeyDown={(event) => { onKey(event, index); }}
          onFocus={() => { setActive(index); }}
          onClick={() => { onSelect(gradient.id); }}
          data-cover-option={gradient.id}
          className={cn(
            "card-nested flex flex-col overflow-hidden rounded-lg text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            gradient.id === selected && "ring-2 ring-foreground/70",
          )}
        >
          <span aria-hidden className="h-10 w-full" style={{ backgroundImage: coverGradientCss(gradient) }} />
          <span className="truncate border-t border-card-edge px-2 py-1 text-xs text-muted-foreground">{gradient.name}</span>
        </button>
      ))}
    </div>
  );
}

type UploadState = { phase: "idle" } | { phase: "preparing" } | { phase: "uploading"; progress: number } | { phase: "error"; message: string };

/** Resizes and re-encodes the picked image in the browser (see src/components/images/prepare-image.ts); the server checks the result like any upload. */
async function preparedCover(file: File): Promise<File> {
  const problem = imageSourceProblem(file, coverPrepareProfile);
  if (problem) throw new Error(problem);
  const prepared = await prepareImage(file, coverPrepareProfile);
  if (!isCoverUploadAllowed(prepared)) throw new Error("That image could not be made small enough. Try another one.");
  return prepared;
}

function busyLabel(state: UploadState): string {
  if (state.phase === "preparing") return "Preparing…";
  if (state.phase === "uploading") return "Uploading…";
  return "Upload an image";
}

/**
 * "Upload an image": one photo or image of your own, prepared in the browser
 * (scaled to at most 2400 px, saved as JPEG, camera data removed) and sent
 * through the normal file pipeline. The save attaches it to the artifact.
 */
function CoverUpload({ onUploaded }: { onUploaded: (fileId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const busy = state.phase === "uploading" || state.phase === "preparing";

  async function pick(file: File | undefined) {
    if (!file) return;
    setState({ phase: "preparing" });
    try {
      const prepared = await preparedCover(file);
      setState({ phase: "uploading", progress: 0 });
      const fileId = await uploadImageFile(prepared, (progress) => { setState({ phase: "uploading", progress }); });
      setState({ phase: "idle" });
      onUploaded(fileId);
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "The upload failed. Try again." });
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t px-3 py-3">
      <input ref={inputRef} type="file" accept={IMAGE_SOURCE_ACCEPT} className="sr-only" tabIndex={-1} aria-describedby={hintId} onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={busy} aria-describedby={hintId} onClick={() => { inputRef.current?.click(); }}>
          {busy ? <IconLoader2 className="animate-spin" /> : <IconPhotoUp />} {busyLabel(state)}
        </Button>
        <p id={hintId} className="text-xs text-muted-foreground">{RULE}</p>
      </div>
      {state.phase === "uploading" ? <Progress value={state.progress} aria-label="Uploading the cover" className="w-40" /> : null}
      {state.phase === "error" ? <p role="alert" className="text-xs text-tone-danger">{state.message}</p> : null}
    </div>
  );
}

/**
 * Picks an artifact's cover: one of the curated gradients (soft tints of the
 * artifact's theme), or, with `allowUpload`, an uploaded image. "Remove
 * cover" shows when there is one.
 */
export function CoverPicker({ value, onChange, trigger, disabled = false, allowUpload = false, align = "end" }: CoverPickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseArtifactCover(value);
  const selected = parsed?.type === "gradient" ? parsed.gradient.id : null;

  function choose(next: string | null) {
    setOpen(false);
    if (next !== value) onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} disabled={disabled} />
      <PopoverContent align={align} sideOffset={8} className="w-[calc(100vw-2rem)] p-0 sm:w-[26rem]">
        <div className="border-b px-3 py-2.5">
          <PopoverTitle>Cover</PopoverTitle>
          <p className="text-xs text-muted-foreground">A slim banner above the artifact. Gradients follow its theme in light and dark.</p>
        </div>
        {open ? <GradientGrid selected={selected} onSelect={choose} /> : null}
        {allowUpload ? <CoverUpload onUploaded={(fileId) => { choose(`${FILE_PREFIX}${fileId}`); }} /> : null}
        {value ? (
          <div className="border-t px-3 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { choose(null); }}>Remove cover</Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
