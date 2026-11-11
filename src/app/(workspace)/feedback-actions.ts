"use server";

import { headers } from "next/headers";

import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { buildFeedbackPayload, deployLabel, feedbackInputSchema, feedbackMessages, slackWebhookUrl } from "@/lib/feedback/feedback-rules";
import { postSlackMessage, SlackWebhookError } from "@/lib/feedback/slack-webhook";
import { getSession } from "@/lib/session";
import { getTeamForMember } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

/** The slug when the person is a member of that shared team, else null. A failed lookup leaves the team out of the report. */
async function memberTeamSlug(userId: string, slug: string | null): Promise<string | null> {
  if (!slug) return null;
  try {
    const membership = await getTeamForMember(userId, slug);
    return membership && !membership.personal ? membership.slug : null;
  } catch {
    return null;
  }
}

/**
 * Sends a "Something's not working" report to the team's Slack channel.
 * Signed-in people only, five an hour each. The report holds the note, the
 * sender's name and email, the page path, their team workspace, browser,
 * viewport, the deploy, and the time; never artifact content, titles, or
 * file names. Without a valid SLACK_FEEDBACK_WEBHOOK_URL it says feedback is
 * not available and posts nothing. A Slack failure asks the person to try
 * again; the dialog keeps their text.
 */
export async function sendFeedbackAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: feedbackMessages.signedOut };
    const parsed = feedbackInputSchema.safeParse(input);
    // Only the note's own messages are written for people; anything else malformed asks for the note.
    if (!parsed.success) return { success: false, error: parsed.error.issues.find((issue) => issue.path[0] === "note")?.message ?? feedbackMessages.empty };
    const webhookUrl = slackWebhookUrl(process.env.SLACK_FEEDBACK_WEBHOOK_URL);
    if (!webhookUrl) return { success: false, error: feedbackMessages.unavailable };

    const { user } = session;
    await enforceRateLimit("feedbackByUser", user.id);
    const [requestHeaders, teamSlug] = await Promise.all([headers(), memberTeamSlug(user.id, parsed.data.teamSlug)]);
    const payload = buildFeedbackPayload({
      note: parsed.data.note,
      name: user.name,
      email: user.email,
      path: parsed.data.path,
      teamSlug,
      userAgent: requestHeaders.get("user-agent"),
      viewport: parsed.data.viewport,
      deploy: deployLabel(process.env.VERCEL_GIT_COMMIT_SHA, process.env.VERCEL_ENV),
      sentAt: new Date(),
    });
    await postSlackMessage(webhookUrl, payload);
    return { success: true, data: null };
  } catch (error) {
    // Only the status for a Slack refusal, or the error's name: never the webhook URL or the note.
    if (!(error instanceof UserFacingError)) console.error("[feedback] Send failed", error instanceof SlackWebhookError ? error.message : error instanceof Error ? error.name : "unknown error");
    return { success: false, error: actionErrorMessage(error, feedbackMessages.retry) };
  }
}
