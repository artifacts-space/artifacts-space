/**
 * Handles are usernames and team slugs. They share one namespace, because a
 * person's username is also their personal team's slug.
 */

export const HANDLE_MIN_LENGTH = 2;
export const HANDLE_MAX_LENGTH = 39;
/** Room left for a "-123" suffix when a suggested handle is taken. */
const SUGGESTION_BASE_LENGTH = 32;

const handlePattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const invalidRun = /[^a-z0-9]+/g;
const edgeHyphens = /^-+|-+$/g;

/** Names that would clash with routes, scopes, or roles. */
const reservedHandles = new Set([
  "admin",
  "api",
  "app",
  "artifact",
  "artifacts",
  "invitations",
  "link",
  "me",
  "mine",
  "new",
  "private",
  "public",
  "root",
  "settings",
  "share",
  "sign-in",
  "sign-up",
  "support",
  "system",
  "team",
  "teams",
  "www",
]);

/** True when the handle is reserved for the product itself. */
export function isReservedHandle(handle: string) {
  return reservedHandles.has(handle);
}

/**
 * Returns a problem with a handle a person typed, or null when it is valid.
 * The input must already be in its final form; this never rewrites it.
 */
export function validateHandle(handle: string): string | null {
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return `Use ${String(HANDLE_MIN_LENGTH)} to ${String(HANDLE_MAX_LENGTH)} characters.`;
  }
  if (handle.includes("--") || !handlePattern.test(handle)) {
    return "Use lowercase letters, numbers, and single hyphens. Start and end with a letter or number.";
  }
  if (isReservedHandle(handle)) return "That name is reserved. Choose another one.";
  return null;
}

/** Trims and lowercases typed input before validation. */
export function cleanHandleInput(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Turns any text (a GitHub login, an email local part, a team name) into the
 * closest valid handle shape, or "" when nothing usable is left.
 */
export function toHandle(value: string, maxLength = HANDLE_MAX_LENGTH) {
  return value
    .toLowerCase()
    .replace(invalidRun, "-")
    .replace(edgeHyphens, "")
    .slice(0, maxLength)
    .replace(edgeHyphens, "");
}

/** A valid starting point for a handle, derived from free text. */
export function suggestHandle(value: string) {
  const base = toHandle(value, SUGGESTION_BASE_LENGTH);
  if (base.length < HANDLE_MIN_LENGTH) return "user";
  if (isReservedHandle(base)) return `${base}-user`;
  return base;
}

/** A handle suggestion from an email address's local part. */
export function suggestHandleFromEmail(email: string) {
  return suggestHandle(email.split("@")[0] ?? "");
}

/**
 * Candidate handles in order of preference: the base, then base-2, base-3, and
 * so on. Every candidate stays within the length limit.
 */
export function handleCandidates(base: string, count: number) {
  const candidates = [base];
  for (let index = 2; index <= count; index += 1) {
    const suffix = `-${String(index)}`;
    const stem = base.slice(0, HANDLE_MAX_LENGTH - suffix.length).replace(edgeHyphens, "");
    candidates.push(`${stem}${suffix}`);
  }
  return candidates;
}
