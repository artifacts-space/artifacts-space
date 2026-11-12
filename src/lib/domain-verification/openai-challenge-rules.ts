/*
 * OpenAI's domain verification for a plugin's MCP server. The submission
 * portal shows a token, and OpenAI reads it back from
 * https://<host>/.well-known/openai-apps-challenge: "host the exact challenge
 * token as plain text ... Return only the exact token—not JSON or a list of
 * tokens." (https://developers.openai.com/plugins/deploy/submission.md).
 * The token is not a secret, but it lives in the environment, never in code,
 * so self-hosted copies never claim this site's listing.
 */

/** The environment variable that holds the token from OpenAI's submission portal. */
export const OPENAI_CHALLENGE_ENV = "OPENAI_APPS_CHALLENGE_TOKEN";

/** The token to serve, trimmed, or null when the variable is unset or blank. */
export function openAiChallengeToken(env: NodeJS.ProcessEnv = process.env): string | null {
  // Read by name, not through the constant, so env-docs.test.ts sees the variable.
  const token = env.OPENAI_APPS_CHALLENGE_TOKEN?.trim();
  return token ? token : null;
}

/**
 * The response for /.well-known/openai-apps-challenge: the exact token as
 * plain text with no trailing newline, or 404 when no token is set, so an
 * empty 200 can never pass for a verified domain. Never cached, so a new
 * token shows as soon as a deploy has it.
 */
export function openAiChallengeResponse(env: NodeJS.ProcessEnv = process.env): Response {
  const token = openAiChallengeToken(env);
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!token) return new Response("Not found", { status: 404, headers });
  return new Response(token, { status: 200, headers });
}
