import type { MentionOutcome } from "@/lib/comments/delivery";
import { documentMentionReport } from "@/lib/comments/document-mention-report";
import type { DocumentMentionReport } from "@/lib/comments/document-mention-rules";
import type { MentionRefusal } from "@/lib/comments/rules";
import { teamHandles } from "@/lib/teams/team-handles";
import type { TeamMembership } from "@/lib/teams/queries";

/**
 * What agents need to @mention a teammate: the handles (teams_list), what a
 * refused comment mention means and what to do next (comment_create and
 * comment_update), and what the handles in a document they saved do
 * (artifacts_create and artifacts_update). Handles come only from the
 * caller's own shared teams, as every member reads them on the team page.
 */

/** The next step an agent can take for a refused comment mention, by reason. */
const nextStepFor: Partial<Record<MentionRefusal, string>> = {
  not_visible: "Use the exact @handle: teams_list lists your teammates' handles and names.",
  cannot_see:
    "Share the artifact with their team first (artifacts_update with visibility; a team owner or admin may need to approve, and agents never approve), then mention them again. An @handle in the artifact's own text tells them by itself once they can read it.",
};

/** A comment's mention outcome as an agent gets it. */
export interface McpMentionOutcome {
  notified: MentionOutcome["notified"];
  refused: (MentionOutcome["refused"][number] & { next?: string })[];
}

/** A comment's mention outcome for an agent, each refusal with its next step where there is one. */
export function toMcpMentions(outcome: MentionOutcome): McpMentionOutcome {
  return {
    notified: outcome.notified,
    refused: outcome.refused.map((item) => {
      const next = nextStepFor[item.reason];
      return next ? { ...item, next } : item;
    }),
  };
}

/**
 * The caller's teams as teams_list returns them. Each shared team lists its
 * members to @mention, without the caller; a personal team is only you, so
 * it lists none. `membersCut` says the list stopped at the cap.
 */
export async function teamsListResult(userId: string, teams: readonly TeamMembership[]) {
  const shared = teams.filter((team) => !team.personal).map((team) => team.id);
  const handles = await teamHandles(userId, shared);
  return teams.map((team) => {
    const base = { slug: team.slug, name: team.name, role: team.role, personal: team.personal, teamSharingNeedsApproval: team.teamSharingNeedsApproval };
    const listed = handles.get(team.id);
    if (!listed) return base;
    // A name is text its owner typed: labelled untrusted, as comment bodies are. A handle is letters, digits, and hyphens only.
    const members = listed.members.map((member) => ({ handle: member.handle, kind: member.kind, name: { untrustedText: member.name } }));
    return { ...base, members, ...(listed.cut ? { membersCut: true } : {}) };
  });
}

/**
 * What the @handles in an artifact's text do after a save, for the agent that
 * saved it, or null when its text names nobody. A failure never fails the
 * save's result: the save landed, and the delivery runs on its own.
 */
export async function savedMentions(artifactId: string, userId: string): Promise<DocumentMentionReport | null> {
  try {
    return await documentMentionReport(artifactId, userId);
  } catch (error) {
    console.error("[mcp] Mention report failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}
