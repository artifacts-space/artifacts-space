import { getViewableArtifact, type ViewableArtifact } from "@/lib/access";
import type { ArtifactDto } from "@/lib/artifact-types";
import { lastEditorsFor, toArtifactDtos } from "@/lib/artifacts";
import { filesForViewer } from "@/lib/files/download";

/**
 * One artifact, in full, as this viewer may read it: through the one access
 * check, with the version they are served (readers outside the team get the
 * approved version) and the files that go with it. Null when the viewer may
 * not read it. Used where a list item is opened: MCP artifacts_get and the
 * workspace.
 */
export async function loadArtifactForViewer(publicId: string, viewerId: string): Promise<{ dto: ArtifactDto; viewable: ViewableArtifact } | null> {
  const viewable = await getViewableArtifact(publicId, viewerId);
  if (!viewable) return null;
  const { editedBy, ...shown } = viewable.view;
  const [[dto], files, editors] = await Promise.all([
    toArtifactDtos([{ ...viewable.record, content: viewable.view.content }]),
    filesForViewer(viewable),
    lastEditorsFor([{ updatedBy: editedBy }]),
  ]);
  if (!dto) return null;
  // Who saved the version this viewer reads: the approved one may be older than the last edit.
  const updatedBy = editedBy ? editors.get(editedBy) ?? null : null;
  return { viewable, dto: { ...dto, ...shown, files, updatedBy, updatedAt: shown.updatedAt.toISOString() } };
}
