"use client";

import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react";

import { decideSharingAction } from "@/app/(workspace)/app/sharing-actions";
import { commentLabel } from "@/components/app/comment-options";
import { visibilityLabel } from "@/components/app/share-options";
import { ArtifactTitleLink } from "@/components/artifact-icon/artifact-title-link";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Button } from "@/components/ui/button";
import type { PendingSharingView } from "@/lib/sharing/queries";

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

/** Open sharing and comments requests, each with approve and deny. People who may approve sharing only. */
export function PendingSharingList({ requests }: { requests: PendingSharingView[] }) {
  const { pending, run } = useTeamAction();
  if (requests.length === 0) return <p className="px-5 py-6 text-md text-muted-foreground">Nothing is waiting for approval.</p>;
  return (
    <ul>
      {requests.map((request) => (
        <li key={request.requestId} className="flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-b-0">
          <div className="min-w-0 flex-1">
            <ArtifactTitleLink publicId={request.publicId} title={request.title} icon={request.icon} />
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
