"use client";

import { IconPhoto } from "@tabler/icons-react";
import { useState } from "react";

import { CoverArt } from "@/components/artifact-cover/cover-art";
import { CoverFrame } from "@/components/artifact-cover/cover-frame";
import { CoverPicker } from "@/components/artifact-cover/cover-picker";
import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { Button } from "@/components/ui/button";
import { coverLabel } from "@/lib/covers/cover";
import { presetTheme } from "@/lib/themes/resolve";

/** The cover picker driving a cover banner, in the Default look and in Ocean, for the gallery and its e2e test. */
export function CoverSpecimen() {
  const [cover, setCover] = useState<string | null>(null);
  const trigger = (
    <Button type="button" variant="outline" size="sm">
      <IconPhoto /> Cover: {coverLabel(cover)}
    </Button>
  );
  return (
    <div className="space-y-3">
      <CoverPicker value={cover} onChange={setCover} trigger={trigger} align="start" />
      {(["default", "ocean"] as const).map((themeId) => (
        <ThemeScope key={themeId} theme={presetTheme(themeId) ?? null} className="overflow-hidden rounded-md bg-background" data-cover-specimen={themeId}>
          {cover ? <CoverFrame><CoverArt cover={cover} /></CoverFrame> : <p className="p-3 text-sm text-muted-foreground">No cover</p>}
        </ThemeScope>
      ))}
    </div>
  );
}
