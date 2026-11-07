"use client";

import { IconCheck, IconLoader2, IconLock, IconX } from "@tabler/icons-react";
import Link from "next/link";

import { decideSharingAction, withdrawSharingAction } from "@/app/(workspace)/app/sharing-actions";
import { commentLabel } from "@/components/app/comment-options";
import { visibilityLabel } from "@/components/app/share-options";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Button } from "@/components/ui/button";
import type { PendingSharingView, TeamSharedView } from "@/lib/sharing/queries";

import { useTeamAction } from "./use-team-action";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function person(name: string, username: string | null) {
  return username ? `@${username}` : name || "A member";
}

/** What the request asks for: a sharing level with who may comment, or opening comments. */
function askedFor(request: PendingSharingView) {
  if (request.kind === "comments") return "asks to open comments to anyone signed in";
  const comments = request.comments ? `, comments: ${commentLabel(request.comments).toLowerCase()}` : "";
  return `asks for ${visibilityLabel(request.level).toLowerCase()} sharing${comments}`;
}

/** Open sharing and comments requests, each with approve and deny. Owners and admins only. */
export function PendingSharingList({ requests }: { requests: PendingSharingView[] }) {
  const { pending, run } = useTeamAction();
  if (requests.length === 0) return <p className="px-5 py-6 text-md text-muted-foreground">Nothing is waiting for approval.</p>;
  return (
    <ul>
      {requests.map((request) => (
        <li key={request.requestId} className="flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <Link href={`/artifact/${request.publicId}`} className="block truncate text-md font-medium hover:underline">{request.title}</Link>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <PixelAvatar seed={request.requesterId} kind={request.requesterKind} size={16} className="mr-1 -mt-px" />
              {person(request.requesterName, request.requesterUsername)} {askedFor(request)} · {dateFormat.format(new Date(request.requestedAt))}
            </p>
          </div>
          <Button size="sm" className="text-xs" disabled={pending !== null} onClick={() => void run(request.requestId, () => decideSharingAction(request.requestId, true), "Sharing approved.")}>
            {pending === request.requestId ? <IconLoader2 className="animate-spin" /> : <IconCheck />} Approve
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" disabled={pending !== null} onClick={() => void run(`${request.requestId}-deny`, () => decideSharingAction(request.requestId, false), "Request denied.")}>
            {pending === `${request.requestId}-deny` ? <IconLoader2 className="animate-spin" /> : <IconX />} Deny
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Artifacts shared through the team. Owners and admins can make any of them private again. */
export function TeamSharedList({ artifacts, canWithdraw }: { artifacts: TeamSharedView[]; canWithdraw: boolean }) {
  const { pending, run } = useTeamAction();
  if (artifacts.length === 0) return <p className="px-5 py-6 text-md text-muted-foreground">No artifacts are shared through this team yet.</p>;
  return (
    <ul>
      {artifacts.map((item) => (
        <li key={item.artifactId} className="flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <Link href={`/artifact/${item.publicId}`} className="block truncate text-md font-medium hover:underline">{item.title}</Link>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <PixelAvatar seed={item.authorId} kind={item.authorKind} size={16} className="mr-1 -mt-px" />
              {person(item.authorName, item.authorUsername)} · {visibilityLabel(item.visibility)}
            </p>
          </div>
          {canWithdraw ? (
            <Button size="sm" variant="outline" className="text-xs" disabled={pending !== null} onClick={() => void run(item.artifactId, () => withdrawSharingAction(item.artifactId), "Sharing withdrawn.")}>
              {pending === item.artifactId ? <IconLoader2 className="animate-spin" /> : <IconLock />} Withdraw
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
