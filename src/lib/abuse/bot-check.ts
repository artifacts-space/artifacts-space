import { checkBotId } from "botid/server";

import { BOT_SUSPECTED_CODE, BOT_SUSPECTED_MESSAGE, botCheckRuns, botCheckTimeoutMs, refusesSignInLink, type BotVerdict } from "@/lib/abuse/bot-check-rules";

/** The verdict, or null when none came within `ms`. The timer never outlives the check. */
async function verdictWithin(ms: number): Promise<BotVerdict | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => { resolve(null); }, ms);
  });
  try {
    return await Promise.race([checkBotId(), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the host's bot check about the current sign-in link request. Returns
 * a 403 to send instead, or null to go on. It fails open: off Vercel, on an
 * error, or without a verdict in time, the request goes on to the rate
 * limits, so a problem with the check never stops people signing in. Logs
 * nothing about the request.
 */
export async function refuseSuspectedBot(): Promise<Response | null> {
  if (!botCheckRuns({ VERCEL_ENV: process.env.VERCEL_ENV })) return null;
  try {
    const verdict = await verdictWithin(botCheckTimeoutMs);
    if (!verdict || !refusesSignInLink(verdict)) return null;
    return Response.json({ code: BOT_SUSPECTED_CODE, message: BOT_SUSPECTED_MESSAGE }, { status: 403, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth] Bot check failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}
