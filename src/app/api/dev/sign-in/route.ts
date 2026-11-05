import { devUser, isDevSignInEnabled } from "@/lib/auth/dev-user";
import { takeDevMagicLink } from "@/lib/auth/magic-link-email";
import { getAuth } from "@/lib/auth/server";
import { isSendirConfigured } from "@/lib/sendir";

/**
 * Development only: signs in as the stub dev user through the real magic-link
 * flow. It requests a link, catches it in the dev outbox, and follows it.
 * The first visit creates the user.
 */
export async function GET(request: Request) {
  if (!isDevSignInEnabled) return new Response("Not found", { status: 404 });
  if (isSendirConfigured()) {
    return new Response("Dev sign-in is off while Sendir keys are set, because the link would be emailed.", { status: 409 });
  }

  await getAuth().api.signInMagicLink({
    body: { email: devUser.email, name: devUser.name, callbackURL: "/app" },
    headers: request.headers,
  });

  const link = takeDevMagicLink(devUser.email);
  if (!link) return new Response("No magic link was created for the dev user.", { status: 500 });
  return Response.redirect(link, 303);
}
