import { and, eq, exists, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";

import { getDb } from "@/db";
import { agent, artifact, artifactVersion, sharingRequest, team, teamMember, type ArtifactRecord } from "@/db/schema";
import { canEditArtifact, canViewArtifact, isAuthorOrActsFor } from "@/lib/access-rules";
import { actsForAuthor } from "@/lib/agents/owner-access";
import { artifactContentColumn, artifactMetaColumns, type ArtifactMetaRecord } from "@/lib/artifact-columns";
import { approvedHarnessOf, artifactHarnessOf } from "@/lib/harness/harness-rules";
import type { ArtifactHarnessDto, ArtifactKind } from "@/lib/artifact-types";
import { isPublicId } from "@/lib/public-id";
import type { StoredArtifactTheme } from "@/lib/themes/artifact-theme";
import { cachedVersionView } from "@/lib/versions/cache";
import { isReviewedLevel, versionToServe } from "@/lib/versions/rules";

/**
 * The one access check for reading artifacts. Every read path (the public
 * page, the workspace, MCP tools, and APIs) goes through getViewableArtifact
 * (with content) or getArtifactAccess (without) for one artifact, or
 * listArtifacts (which uses viewableInTeamCondition) for lists. The rule
 * itself lives in access-rules.ts. The decision is never cached across
 * requests; only approved version content is (src/lib/versions/cache.ts).
 */

/** True when the user is a member of the team. */
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId)))
    .limit(1);
  return Boolean(row);
}

/**
 * SQL for "shared with this team and readable by this viewer": the artifact
 * names the team, is not private, and the viewer is a member of the team.
 */
export function viewableInTeamCondition(viewerId: string, teamId: string) {
  const membership = getDb()
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, viewerId)));
  const condition = and(eq(artifact.teamId, teamId), ne(artifact.visibility, "private"), exists(membership));
  if (!condition) throw new Error("The team scope could not be built.");
  return condition;
}

/** What a viewer reads: the latest version, or the approved one of a link or public artifact. */
export interface ServedArtifactView {
  title: string;
  icon: string | null;
  theme: StoredArtifactTheme | null;
  cover: string | null;
  summary: string;
  content: string;
  kind: ArtifactKind;
  language: string;
  source: string;
  metadata: Record<string, unknown>;
  /** When this version was saved. */
  updatedAt: Date;
  /** Who saved this version: the last editor, or whoever saved the approved version. Null when unknown. */
  editedBy: string | null;
}

/** May this viewer read the artifact, and which version: everything but the content. */
export interface ArtifactAccess {
  /** The stored row, without content. Its fields are the latest version; show `served` or `view` instead. */
  record: ArtifactMetaRecord;
  /** Which version the viewer reads. Readers outside the team get the approved version. */
  version: { source: "latest" | "approved"; versionId: string | null };
  /**
   * The title, icon, theme, cover, save time, and saver of the version this
   * viewer reads, and the agent harness it shows (approvedHarnessOf): readers
   * of the approved version never see the agent of an edit that waits for
   * approval.
   */
  served: { title: string; icon: string | null; theme: StoredArtifactTheme | null; cover: string | null; updatedAt: Date; editedBy: string | null; harness: ArtifactHarnessDto | null };
  /** Whether the viewer may edit it and read its history: the author, or a member of the team it is shared through. */
  canEdit: boolean;
  /** Whether the viewer belongs to the artifact's team. Pages show the team's name only then. */
  isTeamMember: boolean;
  /** Whether the viewer added the agent that wrote it (and is still in its team), so they share it as its author would. */
  actsForAuthor: boolean;
}

/** An artifact the viewer may read, with its content. */
export interface ViewableArtifact extends ArtifactAccess {
  /** What this viewer may read. */
  view: ServedArtifactView;
  /** Whether newer changes wait for approval. Null when the viewer is not told (outside the team). */
  editPending: boolean | null;
}

async function viewerIsMember(viewerId: string | null, teamId: string | null) {
  if (!viewerId || !teamId) return false;
  return isTeamMember(viewerId, teamId);
}

/** Whether the viewer belongs to the team, and whether it is a personal team. */
async function teamContext(viewerId: string | null, teamId: string | null) {
  if (!viewerId || !teamId) return { isTeamMember: false, teamPersonal: null };
  const [row] = await getDb()
    .select({ personal: team.personal })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, viewerId), eq(teamMember.teamId, teamId)))
    .limit(1);
  return { isTeamMember: Boolean(row), teamPersonal: row?.personal ?? null };
}

/** Whether `editorId` may save changes to this artifact. See canEditArtifact. */
export async function canEditRecord(editorId: string, record: ArtifactMetaRecord): Promise<boolean> {
  if (record.userId === editorId) return true;
  if (record.visibility !== "private") {
    const context = await teamContext(editorId, record.teamId);
    if (canEditArtifact({ ...record, teamPersonal: context.teamPersonal }, { userId: editorId, isTeamMember: context.isTeamMember })) return true;
  }
  return actsForAuthor(editorId, record.userId);
}

/**
 * An artifact the editor may edit, without its content: for changes that
 * never touch content, such as its "Made with" label. Null otherwise.
 */
export async function getEditableArtifactMeta(editorId: string, artifactId: string): Promise<ArtifactMetaRecord | null> {
  const [record] = await getDb().select(artifactMetaColumns()).from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (!record) return null;
  return (await canEditRecord(editorId, record)) ? record : null;
}

/**
 * The artifact by internal or public id when `editorId` may edit it: its
 * author, or a member of the team it is shared through. Null otherwise, so
 * callers answer "not found" either way. Every write path that changes
 * content uses this; it loads the whole row, content included.
 */
export async function getEditableArtifact(editorId: string, key: { id: string } | { publicId: string }): Promise<ArtifactRecord | null> {
  if ("publicId" in key && !isPublicId(key.publicId)) return null;
  const where = "id" in key ? eq(artifact.id, key.id) : eq(artifact.publicId, key.publicId);
  const [record] = await getDb().select().from(artifact).where(where).limit(1);
  if (!record) return null;
  return (await canEditRecord(editorId, record)) ? record : null;
}

async function hasPendingEdit(artifactId: string) {
  const [row] = await getDb()
    .select({ id: sharingRequest.id })
    .from(sharingRequest)
    .where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")))
    .limit(1);
  return Boolean(row);
}

/** The viewer's membership in the author agent's team, joined in subjectQuery. */
const ownerMember = alias(teamMember, "owner_member");

/**
 * The query behind loadSubject. Joins, not correlated subqueries: drizzle
 * leaves column names unqualified in a single-table select, so a subquery
 * such as `team_member.team_id = artifact.team_id` would compare team_id with
 * itself and match every team the viewer belongs to. team_member is unique
 * on (team_id, user_id), so the joins add at most one row. The agent join
 * matches only when the author is an agent the viewer added (agent.user_id
 * is its key), and owner_member only when the viewer is still in its team.
 */
export function subjectQuery(db: Pick<ReturnType<typeof getDb>, "select">, publicId: string, viewerId: string | null) {
  const memberOn = viewerId ? and(eq(teamMember.teamId, artifact.teamId), eq(teamMember.userId, viewerId)) : sql`false`;
  const ownedAgentOn = viewerId ? and(eq(agent.userId, artifact.userId), eq(agent.ownerId, viewerId)) : sql`false`;
  const ownerMemberOn = viewerId ? and(eq(ownerMember.teamId, agent.teamId), eq(ownerMember.userId, viewerId)) : sql`false`;
  return db
    .select({
      record: artifactMetaColumns(),
      memberId: teamMember.id,
      ownerMemberId: ownerMember.id,
      teamPersonal: team.personal,
      approvedTitle: artifactVersion.title,
      approvedIcon: artifactVersion.icon,
      approvedTheme: artifactVersion.theme,
      approvedCover: artifactVersion.cover,
      approvedSavedAt: artifactVersion.savedAt,
      approvedBy: artifactVersion.createdBy,
      approvedHarness: artifactVersion.harness,
    })
    .from(artifact)
    .leftJoin(team, eq(team.id, artifact.teamId))
    .leftJoin(teamMember, memberOn)
    .leftJoin(agent, ownedAgentOn)
    .leftJoin(ownerMember, ownerMemberOn)
    .leftJoin(artifactVersion, eq(artifactVersion.id, artifact.approvedVersionId))
    .where(eq(artifact.publicId, publicId))
    .limit(1);
}

/**
 * Everything the read decision needs, in one query and without content: the
 * row, whether the viewer is in its team, whether that team is personal, and
 * the approved version's title, save time, and saver.
 */
async function loadSubject(publicId: string, viewerId: string | null) {
  const [row] = await subjectQuery(getDb(), publicId, viewerId);
  if (!row) return null;
  const { memberId, ownerMemberId, ...rest } = row;
  return { ...rest, member: memberId !== null, actsForAuthor: viewerId !== null && viewerId !== rest.record.userId && ownerMemberId !== null };
}

type Subject = NonNullable<Awaited<ReturnType<typeof loadSubject>>>;

/** The approved version a reader outside the team gets, or null for the latest. */
function approvedVersionFor(subject: Subject, versionId: string) {
  if (subject.approvedTitle === null || subject.approvedSavedAt === null) return null;
  const harness = approvedHarnessOf({ harnessOverride: subject.record.harnessOverride, approvedHarness: subject.approvedHarness });
  return { versionId, served: { title: subject.approvedTitle, icon: subject.approvedIcon, theme: subject.approvedTheme, cover: subject.approvedCover, updatedAt: subject.approvedSavedAt, editedBy: subject.approvedBy, harness } };
}

function latestServed(record: ArtifactMetaRecord) {
  return { title: record.title, icon: record.icon, theme: record.theme, cover: record.cover, updatedAt: record.updatedAt, editedBy: record.updatedBy ?? record.userId, harness: artifactHarnessOf(record) };
}

/**
 * The one read decision, deduplicated per request and never cached across
 * requests: null when the artifact does not exist or the viewer may not read
 * it. Loads no content.
 */
export const getArtifactAccess = cache(async (publicId: string, viewerId: string | null): Promise<ArtifactAccess | null> => {
  if (!isPublicId(publicId)) return null;
  const subject = await loadSubject(publicId, viewerId);
  if (!subject) return null;
  const { record } = subject;
  const member = record.visibility === "private" ? false : subject.member;
  const viewer = viewerId ? { userId: viewerId, isTeamMember: member, actsForAuthor: subject.actsForAuthor } : null;
  if (!canViewArtifact(record, viewer)) return null;
  const decided = versionToServe({ visibility: record.visibility, approvedVersionId: record.approvedVersionId, isAuthor: isAuthorOrActsFor(record, viewer), isTeamMember: member });
  const base = { record, canEdit: canEditArtifact({ ...record, teamPersonal: subject.teamPersonal }, viewer), isTeamMember: member, actsForAuthor: subject.actsForAuthor };
  const approved = decided.source === "approved" ? approvedVersionFor(subject, decided.versionId) : null;
  if (approved) return { ...base, version: { source: "approved", versionId: approved.versionId }, served: approved.served };
  return { ...base, version: { source: "latest", versionId: null }, served: latestServed(record) };
});

async function latestContent(artifactId: string): Promise<string | null> {
  const [row] = await getDb().select({ content: artifactContentColumn }).from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  return row?.content ?? null;
}

async function latestViewable(access: ArtifactAccess): Promise<ViewableArtifact | null> {
  const { record } = access;
  const [content, editPending] = await Promise.all([latestContent(record.id), isReviewedLevel(record.visibility) ? hasPendingEdit(record.id) : false]);
  if (content === null) return null;
  // No project or tags: they are for the author and team, and come from src/lib/projects for them.
  const { title, icon, theme, cover, summary, kind, language, source, metadata } = record;
  const served = latestServed(record);
  const view = { title, icon, theme, cover, summary, content, kind, language, source, metadata, updatedAt: served.updatedAt, editedBy: served.editedBy };
  return { ...access, version: { source: "latest", versionId: null }, served, view, editPending };
}

/**
 * Loads an artifact by public id for a viewer (null when signed out), with
 * the content they may read. Returns null when it does not exist or the
 * viewer may not read it, so callers show the same "not found" either way.
 * Readers outside the artifact's team get its approved version, from the
 * version cache keyed by version id and save time; everyone else reads the
 * row. Deduplicated per request.
 */
export const getViewableArtifact = cache(async (publicId: string, viewerId: string | null): Promise<ViewableArtifact | null> => {
  const access = await getArtifactAccess(publicId, viewerId);
  if (!access) return null;
  if (access.version.versionId) {
    const cached = await cachedVersionView(access.version.versionId, access.served.updatedAt.toISOString());
    if (cached) return { ...access, view: { ...cached, editedBy: access.served.editedBy }, editPending: null };
  }
  return latestViewable(access);
});

/**
 * A quick read check by public id that loads no content, for src/proxy.ts.
 * `viewerId` is resolved only when the artifact is private or team, so link
 * and public pages cost one indexed query.
 */
export async function canReadArtifact(publicId: string, resolveViewer: () => Promise<string | null>): Promise<boolean> {
  if (!isPublicId(publicId)) return false;
  const [subject] = await getDb()
    .select({ userId: artifact.userId, visibility: artifact.visibility, teamId: artifact.teamId })
    .from(artifact)
    .where(eq(artifact.publicId, publicId))
    .limit(1);
  if (!subject) return false;
  if (canViewArtifact(subject, null)) return true;
  const viewerId = await resolveViewer();
  if (!viewerId) return false;
  const member = subject.visibility === "team" ? await viewerIsMember(viewerId, subject.teamId) : false;
  if (canViewArtifact(subject, { userId: viewerId, isTeamMember: member })) return true;
  return canViewArtifact(subject, { userId: viewerId, isTeamMember: member, actsForAuthor: await actsForAuthor(viewerId, subject.userId) });
}
