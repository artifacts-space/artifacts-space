/**
 * What the sign-in forms (src/components/auth) check and say. Pure, so the
 * wording rules are tested without a browser.
 */

/** Said when the network or the server failed. */
export const genericError = "Something went wrong. Check your connection and try again.";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a problem with the email address, or null when it can be sent. */
export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Enter your email address.";
  if (!emailPattern.test(email.trim())) return "Enter a valid email address.";
  return null;
}

/** One message for a wrong password, an unknown email, and an account without a password, so the form never says which emails exist. */
export const passwordRefusal = "That email and password do not match. Check both and try again.";

/** What the server's refusal means for the person, in the form's own words. Rate limit and outage messages are the server's own plain text. */
export function passwordFailureMessage(failure: { status: number; message?: string | undefined }): string {
  if (failure.status === 401 || failure.status === 403) return passwordRefusal;
  if ((failure.status === 429 || failure.status === 503) && failure.message) return failure.message;
  return genericError;
}

/** Returns a problem with what was typed, or null when it can be sent. */
export function passwordFormProblem(email: string, password: string): string | null {
  return validateEmail(email) ?? (password ? null : "Enter your password.");
}
