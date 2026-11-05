import { createHash } from "node:crypto";

import { isSendirConfigured, sendEmail } from "@/lib/sendir";

interface MagicLinkEmail {
  email: string;
  url: string;
  token: string;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderHtml(url: string) {
  const href = escapeHtml(url);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;background:#ffffff">
    <div style="max-width:440px;margin:0 auto">
      <p style="margin:0 0 24px;font-size:14px;font-weight:600">artifacts.space</p>
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:500">Sign in to artifacts.space</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#52525b">Use this link to sign in. It works once and expires in 10 minutes.</p>
      <a href="${href}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#18181b;color:#ffffff;font-size:14px;text-decoration:none">Sign in</a>
      <p style="margin:32px 0 0;font-size:12px;line-height:18px;color:#71717a">If you did not ask for this email, you can ignore it.</p>
    </div>
  </body>
</html>`;
}

/** One key per magic-link token, so a retry never sends the same link twice. */
function idempotencyKey(token: string) {
  return `magic-link:${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * Sends the magic sign-in link with Sendir. In local development without
 * Sendir keys, it prints the link to the server log so sign-in still works.
 */
export async function sendMagicLinkEmail({ email, url, token }: MagicLinkEmail) {
  if (!isSendirConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Sendir is not configured, so sign-in links cannot be sent.");
    console.info(`[auth] Magic link for ${email}: ${url}`);
    return;
  }

  const { error } = await sendEmail(
    {
      to: email,
      fromName: "artifacts.space",
      subject: "Sign in to artifacts.space",
      html: renderHtml(url),
      text: `Sign in to artifacts.space:\n\n${url}\n\nThe link works once and expires in 10 minutes. If you did not ask for this email, you can ignore it.`,
    },
    { idempotencyKey: idempotencyKey(token) },
  );
  if (error) throw new Error(`Sendir could not send the sign-in link: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}
