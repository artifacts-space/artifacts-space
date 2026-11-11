import { nonAuthoritativeGoogleEmail, unverifiedGoogleEmail } from "@/lib/auth/google-sign-in-rules";

/**
 * What the sign-in page says when GitHub or Google sends the person back
 * with `?error=<code>`. Only the code is read, never Better Auth's
 * `error_description`: anyone can put any text in a link, so the page shows
 * only its own sentences. A Map, not an object, so a code such as
 * `__proto__` or `toString` cannot reach an inherited member.
 *
 * Every refusal about the address says the same neutral sentence, so the
 * page never tells a visitor whether an account exists for that address
 * (`account_not_linked` happens only when one does).
 */
const refusedAddress = "We could not sign you in with that account. Use an email link to your address instead.";

const messages: ReadonlyMap<string, string> = new Map([
  [unverifiedGoogleEmail.error, refusedAddress],
  [nonAuthoritativeGoogleEmail.error, refusedAddress],
  ["account_not_linked", refusedAddress],
]);

const fallback = "Sign-in did not finish. Try again, or use an email link.";

/** The message for an `?error=` code on the sign-in page, or null when there is none. */
export function signInErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return messages.get(code) ?? fallback;
}
