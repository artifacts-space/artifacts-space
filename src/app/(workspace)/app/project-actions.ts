"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult, ArtifactProjectDto } from "@/lib/artifact-types";
import {
  createProject,
  deleteProject,
  listArtifactProjects,
  mergeProjects,
  renameProject,
  setProjectIcon,
  type ArtifactProjectChoices,
} from "@/lib/projects/manage";
import { projectNameSchema } from "@/lib/projects/rules";
import { setArtifactProject, type ProjectChoice } from "@/lib/projects/store";
import { getSession } from "@/lib/session";
import { getTeamForMember } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

/**
 * Server actions for projects. Moving an artifact needs edit access to it;
 * managing projects needs access to their scope. Neither files a version.
 */

const idSchema = z.string().trim().min(1).max(200);
const choiceSchema = z.union([
  z.object({ name: projectNameSchema }),
  z.object({ projectId: idSchema }),
  z.object({ none: z.literal(true) }),
]);
const scopeSchema = z.object({ teamSlug: z.string().trim().min(1).max(39).nullable() });

const signedOut = "Your session ended. Sign in again.";
const notFound = "Artifact not found, or you cannot edit it.";

async function requireUserId() {
  const session = await getSession();
  if (!session) throw new UserFacingError(signedOut);
  return session.user.id;
}

/** The projects an artifact can move to: those of its home scope, for editors only. */
export async function listArtifactProjectsAction(artifactId: string): Promise<ActionResult<ArtifactProjectChoices>> {
  try {
    const userId = await requireUserId();
    const choices = await listArtifactProjects(userId, idSchema.parse(artifactId));
    if (!choices) return { success: false, error: notFound };
    return { success: true, data: choices };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Projects did not load. Try again.") };
  }
}

/** Moves an artifact into a project (by id or by name, created when new) or out of every project. */
export async function setArtifactProjectAction(artifactId: string, choice: ProjectChoice): Promise<ActionResult<ArtifactProjectDto | null>> {
  try {
    const userId = await requireUserId();
    const project = await setArtifactProject(userId, idSchema.parse(artifactId), choiceSchema.parse(choice));
    if (project === undefined) return { success: false, error: notFound };
    revalidatePath("/app");
    return { success: true, data: project };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The project did not change. Try again.") };
  }
}

/** The project scope for the manage page: the person's own, or a shared team they belong to. */
async function scopeFor(userId: string, input: z.input<typeof scopeSchema>) {
  const { teamSlug } = scopeSchema.parse(input);
  if (!teamSlug) return { kind: "user" as const, userId };
  const team = await getTeamForMember(userId, teamSlug);
  if (!team || team.personal) throw new UserFacingError("Team not found.");
  return { kind: "team" as const, teamId: team.id };
}

async function run<T>(fallback: string, task: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const userId = await requireUserId();
    const data = await task(userId);
    revalidatePath("/app");
    revalidatePath("/app/projects");
    return { success: true, data };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, fallback) };
  }
}

/** Creates a project in the person's own scope or a team's. */
export async function createProjectAction(scope: z.input<typeof scopeSchema>, input: { name: string; icon: string | null }): Promise<ActionResult<ArtifactProjectDto>> {
  return run("The project was not created. Try again.", async (userId) => createProject(userId, await scopeFor(userId, scope), input));
}

/** Renames a project. */
export async function renameProjectAction(projectId: string, name: string): Promise<ActionResult<ArtifactProjectDto>> {
  return run("The project was not renamed. Try again.", (userId) => renameProject(userId, idSchema.parse(projectId), name));
}

/** Sets or removes a project's icon. */
export async function setProjectIconAction(projectId: string, icon: string | null): Promise<ActionResult<ArtifactProjectDto>> {
  return run("The icon did not change. Try again.", (userId) => setProjectIcon(userId, idSchema.parse(projectId), icon));
}

/** Moves every artifact of one project into another, then deletes the first. */
export async function mergeProjectsAction(sourceId: string, targetId: string): Promise<ActionResult<ArtifactProjectDto>> {
  return run("The projects were not merged. Try again.", (userId) => mergeProjects(userId, idSchema.parse(sourceId), idSchema.parse(targetId)));
}

/** Deletes a project. Its artifacts stay, with no project. */
export async function deleteProjectAction(projectId: string): Promise<ActionResult<null>> {
  return run("The project was not deleted. Try again.", async (userId) => {
    await deleteProject(userId, idSchema.parse(projectId));
    return null;
  });
}
