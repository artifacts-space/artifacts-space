import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactReport, team, teamMember, user } from "@/db/schema";
import { enforceRateLimits } from "@/lib/abuse/rate-limit";
import { getArtifactAccess } from "@/lib/access";
import type { ArtifactVisibility, ReportReason } from "@/lib/artifact-types";
import { findPersonalTeam, getTeamMembershipById } from "@/lib/teams/queries";
import { can } from "@/lib/teams/capability-rules";
import { parseTeamRole } from "@/lib/teams/roles";
import { UserFacingError } from "@/lib/user-facing-error";

import { sendReportEmail } from "./email";
import { isReportable, parseReportInput, reportLimitChecks, reportReasonLabels } from "./rules";

/**
 * Reader reports about link and public artifacts. A report lands with the
 * team that approved the sharing (the author's personal team when there is
 * none), its owners get an email, and its owners and admins see it on the
 * team page, where they can withdraw sharing or dismiss it.
 */

const notFound = "Artifact not found.";

async function reportTeamId(record: { teamId: string | null; userId: string }) {
  if (record.teamId) return record.teamId;
  return (await findPersonalTeam(record.userId))?.id ?? null;
}

async function notifyOwners(input: { reportId: string; teamId: string; title: string; publicId: string; reason: ReportReason }) {
  const [owners, [teamRow]] = await Promise.all([
    getDb()
      .select({ id: user.id, email: user.email, role: teamMember.role })
      .from(teamMember)
      .innerJoin(user, eq(user.id, teamMember.userId))
      .where(eq(teamMember.teamId, input.teamId)),
    getDb().select({ name: team.name, slug: team.slug }).from(team).where(eq(team.id, input.teamId)).limit(1),
  ]);
  if (!teamRow) return;
  const recipients = owners.filter((owner) => parseTeamRole(owner.role) === "owner");
  const results = await Promise.allSettled(
    recipients.map((owner) =>
      sendReportEmail({
        reportId: input.reportId,
        ownerId: owner.id,
        ownerEmail: owner.email,
        teamName: teamRow.name,
        teamSlug: teamRow.slug,
        artifactTitle: input.title,
        publicId: input.publicId,
        reasonLabel: reportReasonLabels[input.reason],
      }),
    ),
  );
  for (const result of results) {
    if (result.status === "rejected") console.error("[reports] Owner email failed", result.reason instanceof Error ? result.reason.message : "unknown error");
  }
}

/**
 * Files a report from a reader, signed in (`viewerId`) or not. Checks the
 * input, that the reader can see the artifact and that it is link or public,
 * and the per-artifact, per-network, and per-user limits (reportLimitChecks). The owners' email never blocks
 * the report.
 */
export async function submitReport(input: { publicId: string; viewerId: string | null; networkKey: string; report: unknown }) {
  const parsed = parseReportInput(input.report);
  if (!parsed.ok) throw new UserFacingError(parsed.error);
  const viewable = await getArtifactAccess(input.publicId, input.viewerId);
  if (!viewable || !isReportable(viewable.record.visibility)) throw new UserFacingError(notFound);

  const { record, served } = viewable;
  await enforceRateLimits(reportLimitChecks({ networkKey: input.networkKey, artifactId: record.id, viewerId: input.viewerId }));

  const teamId = await reportTeamId(record);
  const id = randomUUID();
  await getDb().insert(artifactReport).values({
    id,
    artifactId: record.id,
    teamId,
    reason: parsed.data.reason,
    details: parsed.data.details,
    reporterId: input.viewerId,
    reporterKey: input.networkKey,
  });
  if (teamId) await notifyOwners({ reportId: id, teamId, title: served.title, publicId: record.publicId, reason: parsed.data.reason });
  return { id };
}

/** An open report as the team page lists it. Reporters stay anonymous. */
export interface OpenReportView {
  reportId: string;
  artifactId: string;
  publicId: string;
  title: string;
  icon: string | null;
  visibility: ArtifactVisibility;
  reason: ReportReason;
  details: string;
  reportedAt: string;
}

/** Open reports for a team, newest first. Callers must check the viewer is an owner or admin. */
export async function listOpenReports(teamId: string, limit = 50): Promise<OpenReportView[]> {
  const rows = await getDb()
    .select({
      reportId: artifactReport.id,
      artifactId: artifact.id,
      publicId: artifact.publicId,
      title: artifact.title,
      icon: artifact.icon,
      visibility: artifact.visibility,
      reason: artifactReport.reason,
      details: artifactReport.details,
      reportedAt: artifactReport.createdAt,
    })
    .from(artifactReport)
    .innerJoin(artifact, eq(artifact.id, artifactReport.artifactId))
    .where(and(eq(artifactReport.teamId, teamId), eq(artifactReport.status, "open")))
    .orderBy(desc(artifactReport.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, reportedAt: row.reportedAt.toISOString() }));
}

/** The open report, checked against the viewer: an owner or admin of the report's team. */
export async function getManagedReport(reportId: string, viewerId: string) {
  const [report] = await getDb().select().from(artifactReport).where(and(eq(artifactReport.id, reportId), eq(artifactReport.status, "open"))).limit(1);
  if (!report?.teamId) throw new UserFacingError("This report is no longer open.");
  const membership = await getTeamMembershipById(viewerId, report.teamId);
  if (!membership || !can(membership, "reports.handle")) throw new UserFacingError("You cannot handle reports in this team.");
  return { report, team: membership };
}

/** Marks every open report on one artifact in one team as resolved by the viewer. */
export async function resolveReports(input: { artifactId: string; teamId: string; viewerId: string }) {
  await getDb()
    .update(artifactReport)
    .set({ status: "resolved", resolvedBy: input.viewerId, resolvedAt: new Date() })
    .where(and(eq(artifactReport.artifactId, input.artifactId), eq(artifactReport.teamId, input.teamId), eq(artifactReport.status, "open")));
}
