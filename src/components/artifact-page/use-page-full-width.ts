"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { useFullWidth, type FullWidthControl } from "@/components/app/artifact-editor/use-full-width";
import type { ArtifactDto } from "@/lib/artifact-types";

import { shownFullWidth } from "./full-width-rules";

/**
 * The "Full width" setting on the artifact's own page, the same setting as
 * the /app More menu, for the page header's More menu. It saves at once,
 * apart from the draft and autosave, then refreshes the page so its column
 * follows while the editor stays open. It stays pending until the refresh
 * lands. The checkbox shows `pageFullWidth`, the width the page's column
 * has, so it never shows a width the page does not have, even when the
 * editor's copy was read before a width change (full-width-rules.ts).
 */
export function usePageFullWidth(artifact: ArtifactDto, pageFullWidth?: boolean): FullWidthControl {
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
  const checked = shownFullWidth(pageFullWidth, control.checked);
  return useMemo(() => ({ ...control, checked, pending: control.pending || refreshing }), [control, checked, refreshing]);
}
