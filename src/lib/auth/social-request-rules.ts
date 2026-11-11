/**
 * What a browser may ask for when it starts a GitHub or Google sign-in. The
 * server decides the scopes: Better Auth would otherwise pass a request's
 * `scopes` and `additionalParams` on to the provider, so a crafted request
 * could ask Google for Drive or Gmail access in our app's name.
 */

/** Better Auth routes that start a provider sign-in or link. */
export const socialStartPaths: ReadonlySet<string> = new Set(["/sign-in/social", "/link-social"]);

/** Request fields that would change what the provider is asked for. */
const pinnedFields = ["scopes", "additionalParams"] as const;

/** The field a sign-in start request may not set, or null when it asks for nothing extra. */
export function forbiddenSocialField(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  for (const field of pinnedFields) {
    if (Object.hasOwn(body, field) && (body as Record<string, unknown>)[field] !== undefined) return field;
  }
  return null;
}
