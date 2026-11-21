import type { MentionOutcome } from "@/lib/comments/delivery";
import { documentMentionReport } from "@/lib/comments/document-mention-report";
import type { DocumentMentionReport } from "@/lib/comments/document-mention-rules";
import type { MentionRefusal } from "@/lib/comments/rules";

/**
 * What agents need to @mention a teammate beyond the handles (teams_list,
 * teams-list.ts): what a refused comment mention means and what to do next
 * (comment_create and comment_update), and what the handles in a document
 * they saved do (artifacts_create and artifacts_update).
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
