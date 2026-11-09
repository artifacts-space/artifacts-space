"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { useFullWidth, type FullWidthControl } from "@/components/app/artifact-editor/use-full-width";
import type { ArtifactDto } from "@/lib/artifact-types";

import { shownFullWidth } from "./full-width-rules";

/** Full width on the artifact page: `busy` is a wait that will end (a save, or the page catching up), unlike a control that is only unavailable. */
export interface PageFullWidthControl extends FullWidthControl {
  busy: boolean;
}

/**
 * The "Full width" setting on the artifact's own page, the same setting as
 * the /app More menu, for the page header's More menu. It saves at once,
 * apart from the draft and autosave, then refreshes the page so its column
 * follows while the editor stays open. It stays pending until the refresh
 * lands. The checkbox shows `pageFullWidth`, the width the page's column
 * has, so it never shows a width the page does not have, even when the
 * editor's copy was read before a width change (full-width-rules.ts).
 * The artifact copy kept here gives the save its id; its width is shown
 * only in the dev fixture, which passes no page width.
 */
export function usePageFullWidth(artifact: ArtifactDto, pageFullWidth?: boolean): PageFullWidthControl {
  const router = useRouter();
  const [current, setCurrent] = useState(artifact);
  // A newer copy from the editor (after a save or restore) carries the id the save uses and, without a page width, the width to show.
  const [seen, setSeen] = useState(artifact);
  if (artifact !== seen) {
    setSeen(artifact);
    setCurrent(artifact);
  }
  const [refreshing, startRefresh] = useTransition();
  const onUpdated = useCallback((saved: ArtifactDto) => {
    setCurrent(saved);
    startRefresh(() => { router.refresh(); });
  }, [router]);
  const control = useFullWidth(current, onUpdated);
  const checked = shownFullWidth({ page: pageFullWidth, followed: control.checked });
  // Next never leaves a failed refresh hanging quietly (checked on 16.4, router-reducer/fetch-server-response.js): after a
  // network error it retries when the connection returns (the item stays busy), and after any other error it reloads the page.
  const pending = control.pending || refreshing;
  return useMemo(() => ({ ...control, checked, pending, busy: pending }), [control, checked, pending]);
}
