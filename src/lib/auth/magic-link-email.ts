import { createHash } from "node:crypto";

import { isAgentEmail } from "@/lib/agents/identity";
import { html, renderEmail } from "@/lib/email/layout";
import { refuseUndeliverableAddress } from "@/lib/email/undeliverable-refusal";
import { isSendirConfigured, sendEmail } from "@/lib/sendir";

const TEN_MINUTES = 60 * 10;

interface MagicLinkEmail {
  email: string;
  url: string;
  token: string;
}

/** The sign-in email in the shared layout. The link works once and expires in 10 minutes. */
export function renderMagicLinkEmail(url: string) {
  return renderEmail({
    title: "Sign in to artifacts.space",
    preview: "Use this link to sign in. It works once and expires in 10 minutes.",
    heading: html`Sign in to artifacts.space`,
    paragraphs: [html`Use this link to sign in. It works once and expires in 10 minutes.`],
    action: { label: "Sign in", url },
    note: html`If you did not ask for this email, you can ignore it.`,
    reason: "You got this email because someone asked to sign in to artifacts.space with this address.",
    text: `Sign in to artifacts.space:\n\n${url}\n\nThe link works once and expires in 10 minutes. If you did not ask for this email, you can ignore it.`,
  });
}

/** Links "sent" in development without Sendir, so the dev sign-in route can follow them. */
const devOutbox = new Map<string, string>();

/** Returns and forgets the last development magic link for an email address. */
export function takeDevMagicLink(email: string) {
  const key = email.toLowerCase();
  const url = devOutbox.get(key);
  devOutbox.delete(key);
  return url;
}

/** One key per magic-link token, so a retry never sends the same link twice. */
function idempotencyKey(token: string) {
  return `magic-link:${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * Sends the magic sign-in link with Sendir. In local development without
 * Sendir keys, it prints the link to the server log so sign-in still works.
 * An address Sendir says cannot receive mail is refused with a 422 and the
 * `EMAIL_UNDELIVERABLE` code (undeliverable-address.ts); every other failure
 * is a plain error. Better Auth calls this for every address, with or
 * without an account, so the answer reveals nothing about who signed up.
 */
export async function sendMagicLinkEmail({ email, url, token }: MagicLinkEmail) {
  // Agents never sign in, and their addresses cannot receive mail. Answer as usual so nothing is revealed.
  if (isAgentEmail(email)) return;
  if (!isSendirConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Sendir is not configured, so sign-in links cannot be sent.");
    devOutbox.set(email.toLowerCase(), url);
    console.info(`[auth] Magic link for ${email}: ${url}`);
    return;
  }

  const { error } = await sendEmail(
    { to: email, fromName: "artifacts.space", subject: "Sign in to artifacts.space", ...renderMagicLinkEmail(url) },
    { idempotencyKey: idempotencyKey(token) },
  );
  refuseUndeliverableAddress(error);
  if (error) throw new Error(`Sendir could not send the sign-in link: ${error.name} (${String(error.statusCode ?? "no answer")})`);
}

/**
 * The magic-link plugin's options, used by the app (server.ts) and by the
 * tests that run Better Auth in memory, so both send links the same way.
 */
export const magicLinkPluginOptions = {
  expiresIn: TEN_MINUTES,
  sendMagicLink: ({ email, url, token }: MagicLinkEmail) => sendMagicLinkEmail({ email, url, token }),
};
