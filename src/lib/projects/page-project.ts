import type { ArtifactAccess } from "@/lib/access";
import type { ArtifactProjectDto } from "@/lib/artifact-types";
import { tagsForViewer } from "@/lib/tags/queries";

import { projectsForViewer } from "./queries";

/** What an artifact's page shows its editors under the summary. */
export interface PageOrganizerValues {
  /** Null means "No project". */
  project: ArtifactProjectDto | null;
  tags: string[];
}

/**
 * The project and tags for an artifact's page, or undefined when this viewer
 * gets no organizer controls at all: signed out, or not allowed to edit
 * (every reader of a link or public page outside the team).
 */
export async function pageOrganizersFor(access: Pick<ArtifactAccess, "canEdit" | "record">, viewerId: string | null): Promise<PageOrganizerValues | undefined> {
  if (!access.canEdit || !viewerId) return undefined;
  const [projects, tags] = await Promise.all([projectsForViewer([access.record], viewerId), tagsForViewer([access.record], viewerId)]);
  return { project: projects.get(access.record.id) ?? null, tags: tags.get(access.record.id) ?? [] };
}
