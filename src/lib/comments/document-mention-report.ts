import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { loadActors } from "@/lib/agents/queries";

import { MAX_DOCUMENT_HANDLES } from "./config";
import { mentionCandidates } from "./delivery";
import { documentMentionReportOf, type DocumentMentionReport } from "./document-mention-rules";
import { parseMentions } from "./mentions";
import { threadMutedAgentIds } from "./thread";

/**
 * The writer's view of the mentions in a saved Markdown artifact's text, by
 * the save's own rule (documentMentionReach). Null when the artifact is not
 * Markdown or its text names nobody. It decides nothing and stores nothing:
 * the save's delivery (document-mentions.ts) does that after the response.
 * Unknown handles and people outside the writer's teams read the same, so
 * the report tells the writer nothing about anyone they cannot mention.
 */
export async function documentMentionReport(artifactId: string, writerId: string): Promise<DocumentMentionReport | null> {
  const [row] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (row?.kind !== "markdown") return null;
  const handles = parseMentions(row.content).slice(0, MAX_DOCUMENT_HANDLES);
  if (handles.length === 0) return null;
  const [actors, threadMutes] = await Promise.all([loadActors([writerId]), threadMutedAgentIds(row.id)]);
  const writer = actors.get(writerId);
  if (!writer) return null;
  const candidates = await mentionCandidates(handles, row, writerId, threadMutes, "document");
  // A muted agent's save notifies nobody, as in document-mentions.ts.
  const muted = writer.kind === "agent" && (writer.teamMuted || threadMutes.has(writer.userId));
  return documentMentionReportOf(candidates, { userId: writer.userId, kind: writer.kind, muted });
}
