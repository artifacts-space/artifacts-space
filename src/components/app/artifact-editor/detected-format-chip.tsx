"use client";

import { IconX } from "@tabler/icons-react";
import { useEffect } from "react";

import { formatInfo } from "@/lib/artifact-formats";
import type { ArtifactKind } from "@/lib/artifact-types";

/** How long the chip stays before it goes by itself. */
export const DETECTED_CHIP_MS = 10_000;

/** "CSV", or "Code · python" when a language was found too. */
export function detectedLabel(kind: ArtifactKind, language: string): string {
  const label = formatInfo[kind].label;
  return kind === "code" && language ? `${label} · ${language}` : label;
}

interface DetectedFormatChipProps {
  kind: ArtifactKind;
  language: string;
  onChange: () => void;
  onDismiss: () => void;
}

/**
 * "Detected CSV · Change", beside the toolbar after a new artifact's first
 * paste picked a format. A wrong guess costs one click: Change opens the
 * format choice. It goes by itself after a while, on the next edit (the
 * editor stops showing it), or with its close button. Screen readers hear it
 * once, politely, through DetectedNotice's live region.
 */
export function DetectedFormatChip({ kind, language, onChange, onDismiss }: DetectedFormatChipProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, DETECTED_CHIP_MS);
    return () => { window.clearTimeout(timer); };
  }, [onDismiss]);

  return (
    <span data-slot="detected-format" className="inline-flex h-7 min-w-0 items-center gap-1 rounded-lg bg-muted pr-0.5 pl-2.5 text-xs text-muted-foreground">
      <span className="truncate">Detected <span className="font-medium text-foreground">{detectedLabel(kind, language)}</span></span>
      <span aria-hidden>·</span>
      <button type="button" onClick={onChange} className="rounded-md px-1 font-medium text-foreground underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        Change
      </button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" title="Dismiss" className="inline-flex size-6 items-center justify-center rounded-md outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <IconX aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * The chip while a detected format is showing. The live region stays in the
 * page, so screen readers announce the words when they appear, which a
 * region added together with its text does not reliably do.
 */
export function DetectedNotice({ detected, onChange, onDismiss }: { detected: { kind: ArtifactKind; language: string } | null; onChange: () => void; onDismiss: () => void }) {
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">{detected ? `Detected ${detectedLabel(detected.kind, detected.language)}. Change it in the toolbar.` : ""}</span>
      {detected ? <DetectedFormatChip kind={detected.kind} language={detected.language} onChange={onChange} onDismiss={onDismiss} /> : null}
    </>
  );
}
