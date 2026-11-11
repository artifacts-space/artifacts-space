"use client";

import { useState } from "react";

import { PixelAvatar } from "@/components/pixel-avatar";
import { teamAvatar, type AvatarTeam } from "@/lib/teams/team-avatar-rules";
import { cn } from "@/lib/utils";

interface TeamIconProps {
  /** The team, or null for the viewer's own artifacts. Its iconUrl is the access-checked one (TeamMembership.iconUrl). */
  team: AvatarTeam | null;
  /** The signed-in viewer: their own avatar stands for their personal workspace. */
  viewerId: string;
  /** Width and height in pixels. */
  size: number;
  className?: string;
}

/** A pixel avatar, marked so tests and styles can tell it from an uploaded image. */
function GeneratedAvatar({ seed, kind, size, className }: { seed: string; kind: "person" | "team"; size: number; className: string | undefined }) {
  return (
    <span data-team-icon="avatar" className="inline-flex shrink-0">
      <PixelAvatar seed={seed} kind={kind} size={size} {...(className ? { className } : {})} />
    </span>
  );
}

/**
 * A workspace's avatar, in the pixel style of the header's: the viewer's own
 * avatar for their personal workspace, a team's uploaded icon, or the team's
 * pixel avatar (seeded by its id) when it has none or the image cannot load.
 * Decorative: the name beside it says which workspace. The image comes
 * through the members-only route (/api/teams/<id>/icon), so only the team
 * ever sees it. Never use this on public pages, link previews, or exports.
 */
export function TeamIcon({ team, viewerId, size, className }: TeamIconProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const avatar = teamAvatar(team, viewerId);
  if (avatar.kind === "person") return <GeneratedAvatar seed={avatar.seed} kind="person" size={size} className={className} />;
  if (avatar.kind === "team") return <GeneratedAvatar seed={avatar.seed} kind="team" size={size} className={className} />;
  if (failedUrl === avatar.url) return <GeneratedAvatar seed={avatar.fallbackSeed} kind="team" size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a members-only, privately cached route, which next/image cannot optimize
    <img
      src={avatar.url}
      alt=""
      aria-hidden
      decoding="async"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      data-team-icon="image"
      onError={() => { setFailedUrl(avatar.url); }}
      className={cn("shrink-0 rounded-md bg-muted object-cover", className)}
    />
  );
}
