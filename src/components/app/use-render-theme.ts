"use client";

import { useEffect, useMemo, useState } from "react";

import { artifactRenderThemeAction } from "@/app/(workspace)/app/render-theme-actions";
import type { ArtifactDto } from "@/lib/artifact-types";
import { resolvesWithoutTeam } from "@/lib/themes/render-theme-rules";
import { resolveTheme } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";

type ThemedArtifact = Pick<ArtifactDto, "publicId" | "theme" | "visibility" | "teamId">;

/**
 * The theme an artifact renders with in /app, the same as on its page. A
 * built-in preset, theme JSON, or a private artifact without a theme resolve
 * here at once; a team preset or a team default comes from the server once
 * per theme, sharing, and team, showing the artifact's own theme until it
 * arrives. It follows every change to the artifact, so a new theme shows
 * as soon as the artifact updates.
 */
export function useRenderTheme(artifact: ThemedArtifact): Theme {
  const { publicId, theme, visibility, teamId } = artifact;
  const local = useMemo(() => resolveTheme(theme, null).theme, [theme]);
  const exact = resolvesWithoutTeam(theme, visibility);
  const key = `${publicId}|${JSON.stringify(theme)}|${visibility}|${teamId ?? ""}`;
  const [fetched, setFetched] = useState<{ key: string; theme: Theme } | null>(null);

  useEffect(() => {
    if (exact) return;
    let active = true;
    artifactRenderThemeAction(publicId)
      .then((result) => {
        if (active && result.success) setFetched({ key, theme: result.data });
      })
      // The artifact's own theme stays; a missing team default is never worth an error.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [exact, key, publicId]);

  if (!exact && fetched?.key === key) return fetched.theme;
  return local;
}
