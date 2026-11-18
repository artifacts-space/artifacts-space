import { and, count, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, user } from "@/db/schema";
import { requestArtifactSharing } from "@/lib/sharing/service";
import { homeInTeamCondition, loadTransferMembers } from "@/lib/sharing/transfer";
import { heirAfterLeaving, type TransferMember } from "@/lib/sharing/transfer-rules";
import { UserFacingError } from "@/lib/user-facing-error";

import { departureLimits, movableIds, type DepartingArtifact, type Heir, type LeavePreview, type MoveOutcome, type MoveResult, type RemovalFacts } from "./departure-rules";

/**
 * The database side of the leave and remove confirms (departure-rules.ts):
 * the departing person's artifacts whose home is the team, by the condition
 * the hand-over moves (homeInTeamCondition), and the person who will take
 * them over (heirAfterLeaving). Callers check the session and membership.
 */

const ownInTeam = (teamId: string, userId: string) => and(homeInTeamCondition(teamId), eq(artifact.userId, userId));

/** The person's artifacts whose home is the team, newest first: every one counted, the newest named. */
export async function listOwnTeamArtifacts(teamId: string, userId: string): Promise<{ total: number; artifacts: DepartingArtifact[] }> {
  const db = getDb();
  const [rows, totals] = await Promise.all([
    db.select({ id: artifact.id, publicId: artifact.publicId, title: artifact.title }).from(artifact).where(ownInTeam(teamId, userId)).orderBy(desc(artifact.updatedAt), desc(artifact.id)).limit(departureLimits.listed),
    db.select({ total: count() }).from(artifact).where(ownInTeam(teamId, userId)),
  ]);
  return { total: totals[0]?.total ?? rows.length, artifacts: rows };
}

async function heirNames(ids: readonly string[]): Promise<Map<string, Heir>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb().select({ id: user.id, name: user.name, username: user.username }).from(user).where(inArray(user.id, [...ids]));
  return new Map(rows.map((row) => [row.id, { name: row.name, username: row.username }]));
}

/** Who takes over each departing person's artifacts, by their user id, from one load of the team. */
async function heirsFor(teamId: string, departing: readonly string[], members?: readonly TransferMember[]): Promise<Map<string, Heir | null>> {
  const everyone = members ?? (await loadTransferMembers(teamId));
  const heirIds = new Map(departing.map((userId) => [userId, heirAfterLeaving(everyone, userId)]));
  const names = await heirNames([...new Set([...heirIds.values()].filter((id): id is string => id !== null))]);
  return new Map([...heirIds].map(([userId, heirId]) => [userId, heirId ? (names.get(heirId) ?? null) : null]));
}

/** What leaving the team would hand over, and to whom. */
export async function leavePreviewFor(teamId: string, userId: string): Promise<LeavePreview> {
  const [own, heirs] = await Promise.all([listOwnTeamArtifacts(teamId, userId), heirsFor(teamId, [userId])]);
  return { ...own, heir: heirs.get(userId) ?? null };
}

/** For the remove confirm: each member's count of artifacts whose home is the team, and who would take them, by member id. */
export async function removalFactsFor(teamId: string, members: readonly { memberId: string; userId: string }[]): Promise<Record<string, RemovalFacts>> {
  if (members.length === 0) return {};
  const db = getDb();
  const [counts, heirs] = await Promise.all([
    db.select({ userId: artifact.userId, total: count() }).from(artifact).where(homeInTeamCondition(teamId)).groupBy(artifact.userId),
    heirsFor(teamId, members.map((member) => member.userId)),
  ]);
  const byUser = new Map(counts.map((row) => [row.userId, row.total]));
  return Object.fromEntries(members.map((member) => [member.memberId, { artifacts: byUser.get(member.userId) ?? 0, heir: heirs.get(member.userId) ?? null }]));
}

function refusalReason(error: unknown): string {
  if (error instanceof UserFacingError) return error.personMessage ?? error.message;
  console.error("[teams] Moving an artifact to Personal before leaving failed", error instanceof Error ? error.name : "unknown error");
  return "something went wrong. Try again.";
}

/** Moves one artifact back to its author's Personal through the sharing service, as the Share dialog's private choice does. */
async function moveOne(userId: string, item: DepartingArtifact, outcome: MoveOutcome) {
  try {
    const result = await requestArtifactSharing({ requesterId: userId, artifactId: item.id, visibility: "private", actor: "person" });
    if (result.status === "applied" && result.artifact.visibility === "private") outcome.moved.push(item);
    // Defensive: today the private path always applies for the author. If it ever waits, the dialog must not call it moved.
    else outcome.waiting.push(item);
  } catch (error) {
    outcome.refused.push({ artifact: item, reason: refusalReason(error) });
  }
}

/**
 * Moves the person's chosen artifacts out of the team to their Personal
 * workspace before they leave. Only their own artifacts whose home is this
 * team move: the ids are read back from the database with that condition,
 * and anything else is left alone. Each goes through requestArtifactSharing
 * (private), so every rule that path has still applies, a few at a time.
 */
export async function moveOwnTeamArtifactsToPersonal(input: { teamId: string; userId: string; ids: readonly string[] }): Promise<MoveResult> {
  const rows = input.ids.length === 0 ? [] : await getDb()
    .select({ id: artifact.id, publicId: artifact.publicId, title: artifact.title })
    .from(artifact)
    .where(and(ownInTeam(input.teamId, input.userId), inArray(artifact.id, [...input.ids])));
  const { allowed } = movableIds(input.ids, rows);
  const outcome: MoveOutcome = { moved: [], waiting: [], refused: [] };
  for (let start = 0; start < allowed.length; start += 4) {
    await Promise.all(allowed.slice(start, start + 4).map((item) => moveOne(input.userId, item, outcome)));
  }
  return { outcome, preview: await leavePreviewFor(input.teamId, input.userId) };
}
