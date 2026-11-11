import type { SlackFeedbackPayload } from "./feedback-rules";

/** How long a post to Slack may take before the person is asked to try again. */
export const SLACK_POST_TIMEOUT_MS = 5000;

/**
 * Why a post did not reach Slack: it timed out, Slack answered with a
 * redirect (refused, so a moved or wrong URL), the network failed (DNS,
 * connection), or Slack answered with an error status.
 */
export type SlackFailure = "timeout" | "redirect" | "network" | "status";

/**
 * Slack refused the post or did not answer. Carries the reason and the HTTP
 * status, never the webhook URL, so its message is safe to log.
 */
export class SlackWebhookError extends Error {
  readonly reason: SlackFailure;
  readonly status: number | null;

  constructor(reason: SlackFailure, status: number | null = null) {
    super(status === null ? `Slack post failed: ${reason}` : `Slack post failed: status ${String(status)}`);
    this.name = "SlackWebhookError";
    this.reason = reason;
    this.status = status;
  }
}

/** The messages of an error and its causes, a few levels deep, for telling failures apart. Never logged. */
function causeMessages(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" ").toLowerCase();
}

/** Which kind of failure a thrown fetch error is: the timeout, a refused redirect, or anything else on the network. */
export function slackFailureOf(error: unknown): SlackFailure {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  return causeMessages(error).includes("redirect") ? "redirect" : "network";
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
  } catch (error) {
    throw new SlackWebhookError(slackFailureOf(error));
  }
  // The body is a short "ok" or an error code; it is not needed either way.
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new SlackWebhookError("status", response.status);
}
