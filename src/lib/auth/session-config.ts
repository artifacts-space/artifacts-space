const fiveMinutes = 60 * 5;
const oneDay = 60 * 60 * 24;

/** How long a web session lasts after its last use, in seconds. */
export const sessionLifetimeSeconds = oneDay * 30;

/**
 * Better Auth's session options (src/lib/auth/server.ts).
 *
 * A session lasts 30 days from the last day it was used in the workspace:
 * once a day a signed-in request moves its expiry 30 days out. The renewed
 * cookie reaches the browser only through src/proxy.ts on workspace pages
 * (every signed-in visit to `/` lands there), because server components
 * cannot set cookies. Artifact and team pages do not forward it: artifact
 * responses can be cached, and must never carry a Set-Cookie. Sign-in never offers "don't remember me", so the cookie always has
 * a Max-Age and survives closing the browser.
 *
 * The session and user are also kept in a signed cookie for 5 minutes, so
 * most signed-in requests skip the session query. Trade-off: a session
 * deleted on the server (not by signing out here) keeps working in that
 * browser for up to 5 minutes, and user fields in the session can be up to 5
 * minutes old; code that must be current reads the database (see
 * loadWorkspaceViewer). Signing out clears the cookie at once.
 */
export const sessionConfig = {
  expiresIn: sessionLifetimeSeconds,
  updateAge: oneDay,
  cookieCache: { enabled: true, maxAge: fiveMinutes },
};
