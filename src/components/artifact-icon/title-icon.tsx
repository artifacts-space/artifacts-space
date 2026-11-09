"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setArtifactIconAction } from "@/app/artifact/[publicId]/edit-actions";
import { cn } from "@/lib/utils";

import { IconPicker } from "./icon-picker";
import { addIconTrigger, changeIconTrigger } from "./icon-triggers";

interface TitleIconProps {
  publicId: string;
  /** The latest saved icon. */
  icon: string | null;
  /** Classes for its wrapper, such as centring it across a cover's lower edge. */
  className?: string;
}

const PENDING_MESSAGE = "Icon saved. Readers outside the team see it once a team owner or admin approves it.";

/**
 * The icon above an artifact's title, for people who may edit it. Without
 * an icon, a quiet "Add icon" shows on hover or focus (always on touch
 * screens). Clicking the icon opens the picker to change or remove it.
 * Saves go through the same edit path and approval rule as a title change.
 */
export function TitleIcon({ publicId, icon, className }: TitleIconProps) {
  const router = useRouter();
  const [value, setValue] = useState(icon);
  const [saving, setSaving] = useState(false);
  const [, startRefresh] = useTransition();

  async function save(next: string | null) {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const result = await setArtifactIconAction(publicId, next);
      if (!result.success) {
        setValue(previous);
        toast.error(result.error);
        return;
      }
      setValue(result.data.icon);
      if (result.data.pending) toast.success(PENDING_MESSAGE);
      startRefresh(() => { router.refresh(); });
    } catch {
      setValue(previous);
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const trigger = value ? changeIconTrigger(value, "page", saving) : addIconTrigger;

  return (
    <div className={cn(value ? "mb-2" : "mb-1", className)}>
      <IconPicker value={value} onChange={(next) => void save(next)} trigger={trigger} disabled={saving} />
    </div>
  );
}
