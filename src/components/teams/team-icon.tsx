"use client";

import { useState } from "react";

import { teamMonogram } from "@/lib/teams/team-icon-rules";
import { cn } from "@/lib/utils";

interface TeamIconProps {
  name: string;
  /** The access-checked icon URL (TeamMembership.iconUrl), or null for the monogram. */
  iconUrl: string | null;
  /** Width and height in pixels. */
  size: number;
  className?: string;
}

/**
 * A team's icon, or its monogram (the first letter of its name) when it has
 * none or the image cannot load. The image comes through the members-only
 * redirect (/api/teams/<id>/icon), so only the team ever sees it. Never use
 * this on public pages, link previews, or exports.
 */
export function TeamIcon({ name, iconUrl, size, className }: TeamIconProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = { width: size, height: size };
  if (iconUrl && failedUrl !== iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a members-only redirect to R2, which next/image cannot optimize
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        decoding="async"
        width={size}
        height={size}
        style={box}
        data-team-icon="image"
        onError={() => { setFailedUrl(iconUrl); }}
        className={cn("shrink-0 rounded-md bg-muted object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={box}
      data-team-icon="monogram"
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground", className)}
    >
      {teamMonogram(name)}
    </span>
  );
}
