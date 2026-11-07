import type { ArtifactAccess } from "@/lib/access";
import type { ArtifactProjectDto } from "@/lib/artifact-types";

import { projectsForViewer } from "./queries";

/**
 * The project for an artifact's page, or undefined when this viewer gets no
 * project control at all: signed out, or not allowed to edit (every reader
 * of a link or public page outside the team). Null means "No project".
 */
export async function pageProjectFor(access: Pick<ArtifactAccess, "canEdit" | "record">, viewerId: string | null): Promise<ArtifactProjectDto | null | undefined> {
  if (!access.canEdit || !viewerId) return undefined;
  const projects = await projectsForViewer([access.record], viewerId);
  return projects.get(access.record.id) ?? null;
}
