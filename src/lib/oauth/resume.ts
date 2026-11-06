import { signInPath } from "@/lib/route-status";

/** Parameters the OAuth server adds when it signs a redirect. They are not part of the client's request. */
const signatureParams = new Set(["sig", "exp", "ba_iat", "ba_param", "ba_pl"]);

const AUTHORIZE_PATH = "/api/auth/oauth2/authorize";

/**
 * The authorization request a signed sign-in or consent redirect came from,
 * as a path on this site. Visiting it again with a session continues the
 * flow. A `login` prompt is dropped, because the person has just signed in.
 */
export function authorizeResumePath(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of signatureParams) params.delete(name);
  const prompt = params.get("prompt")?.split(" ").filter((value) => value !== "login").join(" ");
  if (prompt) params.set("prompt", prompt);
  else params.delete("prompt");
  return `${AUTHORIZE_PATH}?${params.toString()}`;
}

/** The sign-in page URL that brings the person back into the authorization request afterwards. */
export function oauthSignInPath(search: string): string {
  return signInPath(authorizeResumePath(search));
}

/** A page's `searchParams` object back as a query string, keeping repeated keys. */
export function searchFromParams(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) search.append(key, item);
    }
  }
  return search.toString();
}
