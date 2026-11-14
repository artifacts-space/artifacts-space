import { randomInt, randomUUID } from "node:crypto";

import { allowPageError, expect, test } from "./support/test";

import { cleanUp, createTestUser, deleteSignInLinks, localDatabaseEnabled, localDatabaseSkipReason, testUserEmail } from "./support/local-db";

/**
 * Sign-in link limits against the real route and the Postgres counters: a
 * burst from one network sends two links and refuses the rest, the refusal
 * is the same whether or not the address has an account, and asking twice
 * for one address within a minute shows a wait in the form. Each test uses
 * its own network address (the dev server trusts x-forwarded-for) and its
 * own @example.com addresses. Needs a local throwaway database
 * (support/local-db.ts); skipped otherwise. In development the links are
 * printed to the server log, never emailed.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const emails: string[] = [];
const users: string[] = [];

test.afterAll(async () => {
  await deleteSignInLinks(emails);
  await cleanUp([], users);
});

/** A made-up address in the benchmarking range, so no two runs share counters. */
function networkAddress() {
  return `198.18.${String(randomInt(0, 256))}.${String(randomInt(1, 255))}`;
}

function newEmail(label: string) {
  const email = `sign-in-limits-${label}-${randomUUID().slice(0, 8)}@example.com`;
  emails.push(email);
  return email;
}

test("should send two links and refuse the rest, alike for known and unknown addresses, when one network bursts", async ({ request, baseURL }) => {
  const userId = await createTestUser();
  users.push(userId);
  const member = await testUserEmail(userId);
  emails.push(member);
  const headers = { "x-forwarded-for": networkAddress(), origin: baseURL ?? "" };
  const ask = async (email: string) => {
    const response = await request.post("/api/auth/sign-in/magic-link", { headers, data: { email, callbackURL: `${baseURL ?? ""}/app` } });
    return { status: response.status(), body: await response.text(), retryAfter: response.headers()["retry-after"] };
  };

  const sentToMember = await ask(member);
  const sentToNobody = await ask(newEmail("nobody"));
  expect(sentToMember.status).toBe(200);
  expect(sentToNobody).toEqual(sentToMember);

  // Refused requests count too, so the wait may grow between the two; only the wait differs.
  const withoutWait = (body: string) => body.replace(/Try again in [^."]+\./, "Try again in …");
  const refusedNobody = await ask(newEmail("nobody"));
  const refusedMember = await ask(member);
  expect(refusedNobody.status).toBe(429);
  expect(Number(refusedNobody.retryAfter)).toBeGreaterThan(0);
  expect(refusedNobody.body).toContain("Your network has asked for several sign-in links in the last minute. Try again in");
  expect(refusedMember.status).toBe(429);
  expect(withoutWait(refusedMember.body)).toBe(withoutWait(refusedNobody.body));
});

test("should tell the person to wait when they ask for a second link to one address within a minute", async ({ page }) => {
  allowPageError("/api/auth/sign-in/magic-link", "The test asks for a second link on purpose, which the limit refuses.");
  await page.setExtraHTTPHeaders({ "x-forwarded-for": networkAddress() });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(newEmail("form"));
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.getByRole("button", { name: "Use a different email" }).click();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  // Next's route announcer is an empty alert too, so pick the form's by its text.
  const alert = page.getByRole("alert").filter({ hasText: "This email address asked for a sign-in link in the last minute." });
  await expect(alert).toContainText("Check your inbox and spam folder for it. Try again in");
  await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
});
