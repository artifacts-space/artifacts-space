import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitBucket } from "@/db/schema";

import { budgetScope, nonSignInDailyLimit, utcDayStart, type BudgetedEmail } from "./budget-rules";

/**
 * The shared daily budget for emails other than sign-in links, counted in the
 * rate-limit table under one key per UTC day. See budget-rules.ts for why.
 */
const budgetKey = () => `emailBudget:nonSignIn:${budgetScope({ VERCEL_ENV: process.env.VERCEL_ENV })}`;

/** How many budgeted emails went out today. */
export async function budgetedEmailsSentToday(nowMs = Date.now()): Promise<number> {
  const [row] = await getDb()
    .select({ count: rateLimitBucket.count })
    .from(rateLimitBucket)
    .where(and(eq(rateLimitBucket.key, budgetKey()), eq(rateLimitBucket.windowStart, utcDayStart(nowMs))));
  return row?.count ?? 0;
}

/** True while today's budget has room for one more email. Does not use it up. */
export async function emailBudgetHasRoom(nowMs = Date.now()): Promise<boolean> {
  return (await budgetedEmailsSentToday(nowMs)) < nonSignInDailyLimit();
}

/**
 * Uses one email of today's budget, atomically: the counter only goes up
 * while it is under the limit. Returns false, and logs it, when the budget is
 * used up; the caller then skips the email.
 */
export async function reserveBudgetedEmail(kind: BudgetedEmail, nowMs = Date.now()): Promise<boolean> {
  const limit = nonSignInDailyLimit();
  const rows = await getDb()
    .insert(rateLimitBucket)
    .values({ key: budgetKey(), windowStart: utcDayStart(nowMs), count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBucket.key, rateLimitBucket.windowStart],
      set: { count: sql`${rateLimitBucket.count} + 1` },
      setWhere: sql`${rateLimitBucket.count} < ${limit}`,
    })
    .returning();
  if (rows.length > 0) return true;
  console.error(`[email] Daily budget for non-sign-in email is used up (${String(limit)} a day); a ${kind} email was not sent. Sign-in links are not affected.`);
  return false;
}
