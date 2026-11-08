"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useState, useTransition } from "react";

import { useFullWidth } from "@/components/app/artifact-editor/use-full-width";
import { Switch } from "@/components/ui/switch";
import type { ArtifactDto } from "@/lib/artifact-types";
import { FULL_WIDTH_LABEL } from "@/lib/page-width/rules";

/**
 * The "Full width" setting in the in-place editor on the artifact's page,
 * the same setting as the /app More menu. It saves at once, apart from the
 * draft and Save, then refreshes the page so its column follows while the
 * editor stays open.
 */
export function FullWidthToggle({ artifact }: { artifact: ArtifactDto }) {
  const router = useRouter();
  const [current, setCurrent] = useState(artifact);
  const [refreshing, startRefresh] = useTransition();
  const onUpdated = useCallback((saved: ArtifactDto) => {
    setCurrent(saved);
    startRefresh(() => { router.refresh(); });
  }, [router]);
  const control = useFullWidth(current, onUpdated);
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={control.checked} onCheckedChange={control.onChange} disabled={control.pending || refreshing} size="sm" />
      <label htmlFor={id} className="text-sm text-muted-foreground max-sm:sr-only">{FULL_WIDTH_LABEL}</label>
    </div>
  );
}
