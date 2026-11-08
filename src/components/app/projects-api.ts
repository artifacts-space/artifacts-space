import { createProjectAction, deleteProjectAction, renameProjectAction, setArtifactProjectAction } from "@/app/(workspace)/app/project-actions";
import type { ActionResult, ArtifactProjectDto } from "@/lib/artifact-types";
import type { ProjectChoice } from "@/lib/projects/store";

/**
 * What the sidebar's Projects group calls to change projects. The workspace
 * uses the server actions, which check access on every call; the
 * /dev/workspace fixture hands in an in-memory stand-in.
 */
export interface ProjectsApi {
  /** Moves an artifact into a project (by id or name) or out of every project. */
  moveArtifact: (artifactId: string, choice: ProjectChoice) => Promise<ActionResult<ArtifactProjectDto | null>>;
  /** Creates a project for the viewer (teamSlug null) or a shared team. */
  createProject: (teamSlug: string | null, name: string) => Promise<ActionResult<ArtifactProjectDto>>;
  renameProject: (projectId: string, name: string) => Promise<ActionResult<ArtifactProjectDto>>;
  deleteProject: (projectId: string) => Promise<ActionResult<null>>;
}

/** The server actions behind the Projects group. */
export const serverProjectsApi: ProjectsApi = {
  moveArtifact: (artifactId, choice) => setArtifactProjectAction(artifactId, choice),
  createProject: (teamSlug, name) => createProjectAction({ teamSlug }, { name, icon: null }),
  renameProject: (projectId, name) => renameProjectAction(projectId, name),
  deleteProject: (projectId) => deleteProjectAction(projectId),
};

/** An action's result, or a failure when the call itself threw (offline, server error). */
export async function settle<T>(call: Promise<ActionResult<T>>, fallback: string): Promise<ActionResult<T>> {
  try {
    return await call;
  } catch {
    return { success: false, error: fallback };
  }
}
