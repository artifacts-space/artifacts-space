import { createHash } from "node:crypto";

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

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function shortTitle(title: string) {
  const flat = title.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat || "an artifact";
}

/** The thread page for a mention. Never built from the request. */
export function threadUrl(publicId: string, commentId?: string) {
  const hash = commentId ? `#comment-${encodeURIComponent(commentId)}` : "";
  return siteUrl(`/threads/${encodeURIComponent(publicId)}${hash}`);
}

function renderHtml(url: string, author: string, title: string) {
  const href = escapeHtml(url);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;background:#ffffff">
    <div style="max-width:440px;margin:0 auto">
      <p style="margin:0 0 24px;font-size:14px;font-weight:600">artifacts.space</p>
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:500">${escapeHtml(author)} mentioned you</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#52525b">They mentioned you in a comment on “${escapeHtml(title)}”. Open the thread to read it and reply.</p>
      <a href="${href}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#18181b;color:#ffffff;font-size:14px;text-decoration:none">Open thread</a>
      <p style="margin:32px 0 0;font-size:12px;line-height:18px;color:#71717a">You get this email for the first unread mention on an artifact. Your inbox in artifacts.space lists them all.</p>
    </div>
  </body>
</html>`;
}

/**
 * Emails a person that someone mentioned them. The comment text is never in
 * the email; the person reads it in the app. In local development without
 * Sendir keys, it prints the link to the server log instead. Failures are
 * logged, never thrown: the comment and the inbox entry are already saved.
 */
export async function sendMentionEmail(input: MentionEmail) {
  const url = threadUrl(input.publicId, input.commentId);
  const title = shortTitle(input.artifactTitle);
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
      html: renderHtml(url, input.authorLabel, title),
      text: `${input.authorLabel} mentioned you in a comment on "${title}".\n\nOpen the thread: ${url}`,
    },
    { idempotencyKey: `mention:${createHash("sha256").update(input.mentionId).digest("hex")}` },
  );
  if (error) console.error(`[comments] Sendir could not send a mention email: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
