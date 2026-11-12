import { connection } from "next/server";

import { openAiChallengeResponse } from "@/lib/domain-verification/openai-challenge-rules";

/**
 * /.well-known/openai-apps-challenge: OpenAI's domain verification token for
 * the plugin submission, from OPENAI_APPS_CHALLENGE_TOKEN; 404 without one.
 * Read at request time, so the build needs no token.
 */
export async function GET(): Promise<Response> {
  await connection();
  return openAiChallengeResponse();
}
