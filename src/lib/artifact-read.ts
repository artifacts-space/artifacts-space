import { getViewableArtifact, type ViewableArtifact } from "@/lib/access";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { lastEditorsFor, toArtifactDtos } from "@/lib/artifacts";
import { filesForViewer } from "@/lib/files/download";
import { storedThemeForReader } from "@/lib/themes/theme-privacy";

/**
 * One artifact, in full, as this viewer may read it: through the one access
 * check, with the version they are served (readers outside the team get the
 * approved version) and the files that go with it. Null when the viewer may
 * not read it. The project, tags, and team preset ids show only to editors
 * (the author and the team it is shared through). Used where a list item is opened: MCP artifacts_get and the
 * workspace. With `editingFlags`, an editor served the latest version also
 * gets each file's `embedded` and `pictured` (what files_replace refuses),
 * from the same lookup; readers never do.
 */
export async function loadArtifactForViewer(publicId: string, viewerId: string, options: { editingFlags?: boolean } = {}): Promise<{ dto: ArtifactDto; viewable: ViewableArtifact } | null> {
  const viewable = await getViewableArtifact(publicId, viewerId);
  if (!viewable) return null;
  const { editedBy, ...shown } = viewable.view;
  const [[dto], files, editors] = await Promise.all([
    toArtifactDtos([{ ...viewable.record, content: viewable.view.content }], viewerId),
    filesForViewer(viewable),
    lastEditorsFor([{ updatedBy: editedBy }]),
  ]);
  if (!dto) return null;
  // Who saved the version this viewer reads: the approved one may be older than the last edit.
  const updatedBy = editedBy ? editors.get(editedBy) ?? null : null;
  // Projects and tags are for the author and the team only: readers outside it never get them.
  const project = viewable.canEdit ? dto.project : null;
  const tags = viewable.canEdit ? dto.tags : [];
  // A team preset id carries a name the team chose: outsiders read "custom" (theme-privacy.ts).
  const theme = storedThemeForReader(shown.theme, viewable.canEdit);
  // The harness of the version this viewer reads: never the agent of an edit that waits for approval.
  const { harness } = viewable.served;
  const shownFiles = editsLatest(viewable, options) ? withEditingFlags(files, dto.files) : files;
  return { viewable, dto: { ...dto, ...shown, theme, project, tags, files: shownFiles, updatedBy, harness, updatedAt: shown.updatedAt.toISOString() } };
}

/** Whether the files carry their editing flags: asked for, and read by an editor of the latest version. */
function editsLatest(viewable: ViewableArtifact, options: { editingFlags?: boolean }): boolean {
  return options.editingFlags === true && viewable.canEdit && viewable.version.source === "latest";
}

/** The served files, each with the editing flags its full entry carries (both lists are the latest files of one artifact). */
function withEditingFlags(files: readonly FileDto[], full: readonly FileDto[]): FileDto[] {
  const byId = new Map(full.map((file) => [file.id, file]));
  return files.map((file) => {
    const entry = byId.get(file.id);
    return { ...file, ...(entry?.embedded === true ? { embedded: true } : {}), ...(entry?.pictured === true ? { pictured: true } : {}) };
  });
}
