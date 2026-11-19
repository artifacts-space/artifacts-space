/**
 * The bot check on sign-in links, as pure rules. Scripts drive a browser to
 * the sign-in form and ask for links to addresses that are not theirs; each
 * link is an email to a stranger, who reports it as spam, and enough reports
 * stop everyone's sign-in email. Rate limits do not see it: each request
 * comes from another network.
 *
 * The check guards one request only, the one that emails a link, and only
 * from the sign-in pages. Agents are this product's users: nothing they call
 * (MCP, the OAuth endpoints, the API, tokens) is ever checked. Keep it so.
 */

/** The one request the browser proves itself for. The server checks the same request (isMagicLinkRequest). */
export const signInLinkProtection: { path: string; method: string }[] = [{ path: "/api/auth/sign-in/magic-link", method: "POST" }];

/** What the host's bot check says about a request. */
export interface BotVerdict {
  isBot: boolean;
  isVerifiedBot: boolean;
}

/**
 * True when a sign-in link request is refused: the check calls it a bot and
 * cannot name it. A verified bot (an assistant that signs its requests, which
 * a script cannot fake) is let through, like a person.
 */
export function refusesSignInLink(verdict: BotVerdict): boolean {
  return verdict.isBot && !verdict.isVerifiedBot;
}

/**
 * True where the host's bot check exists: a Vercel deployment. Anywhere else
 * (local development, tests, a self-hosted server) there is nothing to ask,
 * so the request goes on to the rate limits as before.
 */
export function botCheckRuns(env: { VERCEL_ENV?: string | undefined }): boolean {
  return env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}

/** How long the server waits for a verdict before it lets the request go on. Sign-in never hangs on the check. */
export const botCheckTimeoutMs = 3000;

/** The stable code a refused sign-in link carries. Clients match on it, never on the message. */
export const BOT_SUSPECTED_CODE = "BOT_SUSPECTED";

/** What the sign-in form shows. It says nothing about the address, so it is the same for every address. */
export const BOT_SUSPECTED_MESSAGE = "We could not confirm that this request came from your browser. Reload the page and try again, or continue with GitHub or Google.";
