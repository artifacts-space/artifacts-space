/**
 * Dragging an artifact card onto a project in the sidebar. The card puts its
 * id under a private type, so drops from other pages or apps are ignored.
 */
export const ARTIFACT_DRAG_TYPE = "application/x-artifacts-space-artifact";

/** Starts a drag of one artifact card. */
export function startArtifactDrag(event: React.DragEvent, artifact: { id: string; title: string }) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(ARTIFACT_DRAG_TYPE, artifact.id);
  event.dataTransfer.setData("text/plain", artifact.title);
}

/** True while the drag carries an artifact card. Only the types are readable before the drop. */
export function carriesArtifact(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes(ARTIFACT_DRAG_TYPE);
}

/** The dropped artifact's id, or null for anything else. */
export function droppedArtifactId(event: React.DragEvent): string | null {
  return event.dataTransfer.getData(ARTIFACT_DRAG_TYPE) || null;
}
