import { unverifiedGoogleEmail } from "@/lib/auth/google-sign-in-rules";

/**
 * What the sign-in page says when GitHub or Google sends the person back
 * with `?error=<code>`. Only the code is read, never Better Auth's
 * `error_description`: anyone can put any text in a link, so the page shows
 * only its own sentences.
 */
const messages: Readonly<Record<string, string>> = {
  [unverifiedGoogleEmail.error]: "Google has not verified this email address, so we cannot sign you in with it. Use an email link instead.",
  account_not_linked: "This email already has an account, and we could not confirm that this sign-in belongs to it. Use an email link instead.",
};

const fallback = "Sign-in did not finish. Try again, or use an email link.";

/** The message for an `?error=` code on the sign-in page, or null when there is none. */
export function signInErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return messages[code] ?? fallback;
}
