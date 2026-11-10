import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { actsForAuthor } from "@/lib/agents/owner-access";
import { getTeamMembershipById } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { canChangeCsvDownload } from "./rules";

/*
 * Turns "Allow CSV download" on or off for one CSV artifact. Only its
 * author (or the person who added the agent that wrote it) and the owners
 * and admins of its shared team may, in the web app; agents never may
 * (canChangeCsvDownload). Everyone else gets "not found", so the answer
 * never tells whether an artifact exists. It is a display setting: no
 * version, no approval.
 */

const inputSchema = z.object({ actorId: z.string().min(1), artifactId: z.string().min(1).max(200), on: z.boolean(), actor: z.enum(["person", "agent"]) });

const notFoundMessage = "Artifact not found. Only its author and the team's owners and admins can change whether readers can download it.";

/**
 * Who may change it, from the database: the author, the agent's owner, or a
 * team approver. People only. The author needs no lookup; everyone else
 * costs the agent-owner check and one membership read, which also says
 * whether the team is personal.
 */
async function mayChange(actorId: string, record: { userId: string; teamId: string | null }, actor: "person" | "agent"): Promise<boolean> {
  if (actor !== "person") return false;
  if (actorId === record.userId) return true;
  const [forAuthor, membership] = await Promise.all([
    actsForAuthor(actorId, record.userId),
    record.teamId ? getTeamMembershipById(actorId, record.teamId) : Promise.resolve(null),
  ]);
  return canChangeCsvDownload({ actorId, authorId: record.userId, actsForAuthor: forAuthor, member: membership, teamPersonal: membership?.personal ?? null, actor });
}

/** The saved setting, with the public id for the caller to refresh its page. */
export interface SavedCsvDownload {
  publicId: string;
  allowCsvDownload: boolean;
}

/**
 * Sets "Allow CSV download". Throws "not found" for anyone who may not
 * change it and for artifacts that are not CSV. The write repeats the
 * author check, so an ownership move racing this one cannot slip through.
 */
export async function setCsvDownload(input: { actorId: string; artifactId: string; on: boolean; actor: "person" | "agent" }): Promise<SavedCsvDownload> {
  const { actorId, artifactId, on, actor } = inputSchema.parse(input);
  if (actor !== "person") throw new UserFacingError(notFoundMessage);
  const [record] = await getDb()
    .select({ userId: artifact.userId, teamId: artifact.teamId, kind: artifact.kind, publicId: artifact.publicId })
    .from(artifact)
    .where(eq(artifact.id, artifactId))
    .limit(1);
  if (record?.kind !== "csv" || !(await mayChange(actorId, record, actor))) throw new UserFacingError(notFoundMessage);
  await enforceRateLimit("artifactUpdate", actorId);
  const [updated] = await getDb()
    .update(artifact)
    .set({ allowCsvDownload: on })
    .where(and(eq(artifact.id, artifactId), eq(artifact.userId, record.userId)))
    // The whole row: getDb() is a union of two clients, on which the column-list overload of returning() does not type.
    .returning();
  if (!updated) throw new UserFacingError(notFoundMessage);
  return { publicId: updated.publicId, allowCsvDownload: updated.allowCsvDownload };
}

/** Whether `actorId` may change the setting on this artifact: for showing the control only to them. Never throws. */
export async function canChangeCsvDownloadFor(actorId: string | null, record: { userId: string; teamId: string | null; kind: string }): Promise<boolean> {
  if (!actorId || record.kind !== "csv") return false;
  try {
    return await mayChange(actorId, record, "person");
  } catch (error) {
    console.error("[csv-export] Permission check failed", error instanceof Error ? error.name : "unknown error");
    return false;
  }
}
