import type { FeedbackSend } from "@/components/feedback/feedback-dialog";
import { rateLimitMessages } from "@/lib/abuse/limits";
import { feedbackMessages } from "@/lib/feedback/feedback-rules";

/**
 * The dev fixture's stand-in for sendFeedbackAction, so e2e tests never
 * reach Slack. `?feedback=fail|unavailable|limit` on the page picks the
 * answer the server would give; anything else is a successful send. It
 * records what the dialog sent on `document.body.dataset.fixtureFeedback`.
 */
export const fixtureFeedbackSend: FeedbackSend = (input) => {
  document.body.dataset.fixtureFeedback = JSON.stringify(input);
  const mode = new URLSearchParams(window.location.search).get("feedback");
  if (mode === "fail") return Promise.resolve({ success: false, error: feedbackMessages.retry });
  if (mode === "unavailable") return Promise.resolve({ success: false, error: feedbackMessages.unavailable });
  if (mode === "limit") return Promise.resolve({ success: false, error: `${rateLimitMessages.feedbackByUser} Try again in about 30 minutes.` });
  return Promise.resolve({ success: true, data: null });
};
