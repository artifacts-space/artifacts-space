import { ConfirmationsProvider } from "@/components/confirmations-provider";
import type { ViewableArtifact } from "@/lib/access";
import { listSkippedConfirmations } from "@/lib/confirmations/store";
import type { FileDto } from "@/lib/files/types";
import { isReviewedLevel } from "@/lib/versions/rules";

import { EditSurface } from "./edit-surface";

interface EditorIslandProps {
  viewable: ViewableArtifact;
  viewerId: string;
  files: FileDto[];
  children: React.ReactNode;
}

/**
 * The artifact on its page, unlocked for editing in place, for a signed-in viewer
 * who may edit it. Render it only when `viewable.canEdit` is true. It lives
 * outside every cached segment: editors read the latest version, which is
 * never cached, and the editor loads its own copy through a server action.
 */
export async function EditorIsland({ viewable, viewerId, files, children }: EditorIslandProps) {
  if (!viewable.canEdit) return children;
  // Without the list, every confirmation shows. That is the safe side.
  const skipped = await listSkippedConfirmations(viewerId).catch(() => []);
  const { record } = viewable;
  return (
    <ConfirmationsProvider initial={skipped}>
      <EditSurface publicId={record.publicId} title={record.title} updatedAt={record.updatedAt.toISOString()} reviewed={isReviewedLevel(record.visibility)} fullWidth={record.fullWidth} files={files}>
        {children}
      </EditSurface>
    </ConfirmationsProvider>
  );
}
