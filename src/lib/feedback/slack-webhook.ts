import type { SlackFeedbackPayload } from "./feedback-rules";

/** How long a post to Slack may take before the person is asked to try again. */
export const SLACK_POST_TIMEOUT_MS = 5000;

/** Slack refused the post or did not answer. Carries only the HTTP status, never the webhook URL. */
export class SlackWebhookError extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null ? "Slack did not answer" : `Slack answered ${String(status)}`);
    this.name = "SlackWebhookError";
    this.status = status;
  }
}

/**
 * Posts one message to a Slack Incoming Webhook. Throws SlackWebhookError
 * when Slack refuses it or does not answer within SLACK_POST_TIMEOUT_MS.
 * Redirects are refused, so the message can only ever reach the checked
 * URL. The URL is a secret: it is never logged or put in an error.
 */
export async function postSlackMessage(webhookUrl: string, payload: SlackFeedbackPayload): Promise<void> {
  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(SLACK_POST_TIMEOUT_MS),
    });
  } catch {
    throw new SlackWebhookError(null);
  }
  // The body is a short "ok" or an error code; it is not needed either way.
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new SlackWebhookError(response.status);
}
