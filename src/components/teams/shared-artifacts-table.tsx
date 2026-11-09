"use client";

import { IconLoader2, IconLock } from "@tabler/icons-react";

import { withdrawSharingAction } from "@/app/(workspace)/app/sharing-actions";
import { visibilityLabel } from "@/components/app/share-options";
import { ArtifactTitleLink } from "@/components/artifact-icon/artifact-title-link";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Button } from "@/components/ui/button";
import type { TeamSharedView } from "@/lib/sharing/queries";

import { cell, dateFormat } from "./member-table-cells";
import { useTeamAction } from "./use-team-action";

function person(name: string, username: string | null) {
  return username ? `@${username}` : name || "A member";
}

/** When it was shared, from its approval; artifacts shared without approval leave no record, so they show when they last changed. */
function sharedWhen(item: TeamSharedView) {
  return item.sharedAt ? `Shared ${dateFormat.format(new Date(item.sharedAt))}` : `Updated ${dateFormat.format(new Date(item.updatedAt))}`;
}

/**
 * Artifacts shared through the team, with author, visibility, and date.
 * Owners and admins can make any of them private again with Withdraw.
 */
export function SharedArtifactsTable({ artifacts, canWithdraw }: { artifacts: TeamSharedView[]; canWithdraw: boolean }) {
  const { pending, run } = useTeamAction();
  if (artifacts.length === 0) return <p className="px-5 py-6 text-md text-muted-foreground">No artifacts are shared through this team yet.</p>;
  return (
    <table className="w-full border-collapse text-sm" aria-label="Shared artifacts">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className={`${cell.first} py-2 font-normal`}>Artifact</th>
          <th className={`${cell.wide} py-2 font-normal`}>Author</th>
          <th className={`${cell.wide} py-2 font-normal`}>Visibility</th>
          <th className={`${cell.wide} py-2 font-normal`}>Date</th>
          <th className={`${cell.last} py-2`}><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {artifacts.map((item) => (
          <tr key={item.artifactId} className="border-t">
            <td className={`${cell.first} w-full max-w-0`}>
              <div className="min-w-0 truncate"><ArtifactTitleLink publicId={item.publicId} title={item.title} icon={item.icon} /></div>
              <p className="truncate text-xs text-muted-foreground sm:hidden">
                {person(item.authorName, item.authorUsername)} · {visibilityLabel(item.visibility)} · {sharedWhen(item)}
              </p>
            </td>
            <td className={`${cell.wide} whitespace-nowrap`}>
              <span className="inline-flex items-center gap-1.5"><PixelAvatar seed={item.authorId} kind={item.authorKind} size={16} />{person(item.authorName, item.authorUsername)}</span>
            </td>
            <td className={`${cell.wide} whitespace-nowrap`}>{visibilityLabel(item.visibility)}</td>
            <td className={`${cell.wide} whitespace-nowrap text-muted-foreground`}>{sharedWhen(item)}</td>
            <td className={cell.last}>
              {canWithdraw ? (
                <Button size="sm" variant="outline" className="text-xs" disabled={pending !== null} aria-label={`Withdraw ${item.title}`} onClick={() => void run(item.artifactId, () => withdrawSharingAction(item.artifactId), "Sharing withdrawn.")}>
                  {pending === item.artifactId ? <IconLoader2 className="animate-spin" /> : <IconLock />} <span className="hidden sm:inline">Withdraw</span>
                </Button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
