"use client";

import { IconPalette } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { useNoteOwnSave } from "@/components/artifact-page/page-editor-chrome";
import { setArtifactThemeAction } from "@/app/artifact/[publicId]/edit-actions";
import { themeLabel, type StoredArtifactTheme } from "@/lib/themes/artifact-theme";
import { noThemeChoices, type ThemeChoices } from "@/lib/themes/theme-choice-types";
import { cn } from "@/lib/utils";

import { teamPresetNames } from "./theme-options";
import { ThemePicker } from "./theme-picker";

interface TitleThemeProps {
  publicId: string;
  /** The latest saved theme. */
  theme: StoredArtifactTheme | null;
  /** Team presets the editor may use, and the team default the artifact inherits. */
  choices?: ThemeChoices;
}

const PENDING_MESSAGE = "Theme saved. Readers outside the team see it once a team owner or admin approves it.";

/**
 * The theme control in an artifact's title area, for people who may edit
 * it. Without a theme, a quiet "Theme" shows on hover or focus (always on
 * touch screens); with one, its name shows. Saves go through the same edit
 * path and approval rule as a title or icon change.
 */
export function TitleTheme({ publicId, theme, choices = noThemeChoices }: TitleThemeProps) {
  const names = useMemo(() => teamPresetNames(choices), [choices]);
  const router = useRouter();
  const noteOwnSave = useNoteOwnSave();
  const [value, setValue] = useState(theme);
  const [saving, setSaving] = useState(false);
  const [, startRefresh] = useTransition();

  async function save(next: string | null) {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const result = await setArtifactThemeAction(publicId, next);
      if (!result.success) {
        setValue(previous);
        toast.error(result.error);
        return;
      }
      setValue(result.data.theme);
      noteOwnSave(result.data);
      if (result.data.pending) toast.success(PENDING_MESSAGE);
      startRefresh(() => { router.refresh(); });
    } catch {
      setValue(previous);
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const trigger = (
    <button
      type="button"
      aria-label={value ? `Theme: ${themeLabel(value, names)}. Change theme` : "Choose a theme"}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:opacity-100",
        value ? "opacity-100" : "opacity-0 group-hover/title:opacity-100 pointer-coarse:opacity-100",
        saving && "opacity-60",
      )}
    >
      <IconPalette aria-hidden className="size-4" /> {value ? themeLabel(value, names) : "Theme"}
    </button>
  );

  return <ThemePicker value={value} onChange={(next) => void save(next)} trigger={trigger} choices={choices} disabled={saving} />;
}
