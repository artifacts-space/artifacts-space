import { visibilityLabel } from "@/components/app/share-options";
import { ArtifactTitleLink } from "@/components/artifact-icon/artifact-title-link";
import { PixelAvatar } from "@/components/pixel-avatar";
import type { PendingEditView } from "@/lib/versions/queries";

import { EditDecisionButtons } from "./edit-decision-buttons";
import { EditDiff } from "./edit-diff";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function person(name: string, username: string | null) {
  return username ? `@${username}` : name || "A member";
}

/**
 * Edits to link and public artifacts waiting for approval, each with a
 * before/after view and approve or deny. Owners and admins only.
 */
export function EditReviewList({ edits }: { edits: PendingEditView[] }) {
  if (edits.length === 0) return <p className="px-5 py-6 text-md text-muted-foreground">No edits are waiting for approval.</p>;
  return (
    <ul>
      {edits.map((edit) => (
        <li key={edit.requestId} className="space-y-3 border-b px-5 py-4 last:border-b-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <ArtifactTitleLink publicId={edit.publicId} title={edit.after.title} icon={edit.after.icon} />
              <p className="mt-0.5 text-sm text-muted-foreground">
                <PixelAvatar seed={edit.requesterId} kind={edit.requesterKind} size={16} className="mr-1 -mt-px" />
                {person(edit.requesterName, edit.requesterUsername)} changed a {visibilityLabel(edit.visibility).toLowerCase()} artifact · {dateFormat.format(new Date(edit.requestedAt))} UTC
              </p>
            </div>
            <EditDecisionButtons requestId={edit.requestId} />
          </div>
          <EditDiff before={edit.before} after={edit.after} />
        </li>
      ))}
    </ul>
  );
}
