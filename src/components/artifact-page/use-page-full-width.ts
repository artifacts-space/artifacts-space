"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { useFullWidth, type FullWidthControl } from "@/components/app/artifact-editor/use-full-width";
import type { ArtifactDto } from "@/lib/artifact-types";

/**
 * The "Full width" setting on the artifact's own page, the same setting as
 * the /app More menu, for the page header's More menu. It saves at once,
 * apart from the draft and autosave, then refreshes the page so its column
 * follows while the editor stays open. It stays pending until the refresh
 * lands, so the menu never shows a width the page does not have yet.
 */
export function usePageFullWidth(artifact: ArtifactDto): FullWidthControl {
  const router = useRouter();
  const [current, setCurrent] = useState(artifact);
  const [refreshing, startRefresh] = useTransition();
  const onUpdated = useCallback((saved: ArtifactDto) => {
    setCurrent(saved);
    startRefresh(() => { router.refresh(); });
  }, [router]);
  const control = useFullWidth(current, onUpdated);
  return useMemo(() => ({ ...control, pending: control.pending || refreshing }), [control, refreshing]);
}
