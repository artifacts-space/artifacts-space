import { createHash } from "node:crypto";

import { reserveBudgetedEmail } from "@/lib/email/budget";
import { html, renderEmail } from "@/lib/email/layout";
import { isSendirConfigured, sendEmail } from "@/lib/sendir";
import { siteUrl } from "@/lib/site-origin";

interface MentionEmail {
  mentionId: string;
  email: string;
  authorLabel: string;
  artifactTitle: string;
  publicId: string;
  commentId: string;
}

const TITLE_MAX = 120;

function shortTitle(title: string) {
  const flat = title.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat || "an artifact";
}

/** The thread page for a mention. Never built from the request. */
export function threadUrl(publicId: string, commentId?: string) {
  const hash = commentId ? `#comment-${encodeURIComponent(commentId)}` : "";
  return siteUrl(`/threads/${encodeURIComponent(publicId)}${hash}`);
}

/** The mention email in the shared layout. The author label and title are escaped; the comment text is never included. */
export function renderMentionEmail(url: string, author: string, title: string) {
  return renderEmail({
    title: `${author} mentioned you`,
    preview: `They mentioned you in a comment on “${title}”.`,
    heading: html`${author} mentioned you`,
    paragraphs: [html`They mentioned you in a comment on “${title}”. Open the thread to read it and reply.`],
    action: { label: "Open thread", url },
    reason: "You get this email for the first unread mention on an artifact. Your inbox in artifacts.space lists them all, and you can turn these emails off in Settings.",
    text: `${author} mentioned you in a comment on "${title}".\n\nOpen the thread: ${url}`,
  });
}

/**
 * Emails a person that someone mentioned them. The comment text is never in
 * the email; the person reads it in the app. In local development without
 * Sendir keys, it prints the link to the server log instead. Failures are
 * logged, never thrown: the comment and the inbox entry are already saved.
 * Over the shared daily email budget the email is skipped (and logged).
 */
export async function sendMentionEmail(input: MentionEmail) {
  const url = threadUrl(input.publicId, input.commentId);
  const title = shortTitle(input.artifactTitle);
  const reserved = await reserveBudgetedEmail("mention").catch((error: unknown) => {
    console.error("[comments] The email budget could not be checked", error instanceof Error ? error.name : "unknown error");
    return false;
  });
  if (!reserved) return;
  if (!isSendirConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[comments] Sendir is not configured, so a mention email was not sent.");
      return;
    }
    console.info(`[comments] Mention of ${input.email} by ${input.authorLabel} on "${title}": ${url}`);
    return;
  }
  const { error } = await sendEmail(
    {
      to: input.email,
      fromName: "artifacts.space",
      subject: `${input.authorLabel} mentioned you on artifacts.space`,
      ...renderMentionEmail(url, input.authorLabel, title),
    },
    { idempotencyKey: `mention:${createHash("sha256").update(input.mentionId).digest("hex")}` },
  );
  if (error) console.error(`[comments] Sendir could not send a mention email: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
