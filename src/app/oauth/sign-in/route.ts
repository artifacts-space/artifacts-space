import { oauthSignInPath } from "@/lib/oauth/resume";

/**
 * The OAuth server's login page. It sends a signed-out person to the normal
 * sign-in page, which returns them to the authorization request once they
 * are signed in, and from there to the consent page.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  return Response.redirect(new URL(oauthSignInPath(url.search), url.origin), 303);
}
