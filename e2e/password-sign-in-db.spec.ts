import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { cleanUp, deleteRegisteredOAuthClients, deleteReviewerAccounts, localDatabaseEnabled, localDatabaseSkipReason } from "./support/local-db";

/**
 * A reviewer account end to end, against the real route and a local
 * throwaway database: the owner's script creates it and prints a password,
 * the reviewer signs in with it on the unlisted reviewer page, lands in the
 * workspace with the sample artifacts, and signs out; and an MCP client's
 * OAuth request sends a signed-out reviewer to the normal sign-in page, where
 * typing the reviewer address reveals the password field and signing in
 * reaches the approval screen. A wrong password and an unknown email get the
 * same refusal. Each test uses its own network
 * address (the dev server trusts x-forwarded-for) and its own @example.com
 * account. Skipped without a local database (support/local-db.ts).
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const emails: string[] = [];
const clients: string[] = [];
const clientName = "Reviewer test client";

test.afterAll(async () => {
  await deleteRegisteredOAuthClients(clients, clientName);
  await deleteReviewerAccounts(emails);
  await cleanUp([], []);
});

/** Runs the owner's script against the local database and returns the password it printed. */
function createReviewer(label: string) {
  const suffix = randomUUID().slice(0, 8);
  const email = `password-${label}-${suffix}@example.com`;
  emails.push(email);
  const stdout = execFileSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/create-reviewer-account.mts", "--email", email, "--name", "Directory reviewer", "--username", `pw-${label}-${suffix}`],
    // Only the local test database: the guard in localDatabaseEnabled() already checked it is on this machine.
    { env: { ...process.env, DATABASE_URL_UNPOOLED: "", ALLOW_SHARED_REVIEWER_ACCOUNT: "" }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const password = stdout.trim();
  expect(password).toMatch(/^[A-Za-z0-9_-]{24,}$/);
  return { email, password };
}

function setFreshNetwork(page: Page) {
  return page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.${String(randomInt(0, 256))}.${String(randomInt(1, 255))}` });
}

/** Signs in on the unlisted reviewer page, `next` kept as on the normal sign-in page. */
async function signIn(page: Page, email: string, password: string, path = "/sign-in/reviewer") {
  await setFreshNetwork(page);
  await page.goto(path);
  const form = page.getByRole("form", { name: "Sign in with a password" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
  return form;
}

test("should sign a reviewer in with the printed password, show the sample artifacts, and sign out", async ({ page }) => {
  const { email, password } = createReviewer("flow");

  await signIn(page, email, password);
  await page.waitForURL(/\/app(\/|$|\?)/);
  for (const title of ["Launch plan: shared reading list", "How we write meeting notes", "Office supplies budget"]) {
    await expect(page.getByText(title).first()).toBeVisible();
  }

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("should return to the page the reviewer came from when sign-in started there", async ({ page }) => {
  const { email, password } = createReviewer("next");

  await signIn(page, email, password, "/sign-in/reviewer?next=%2Fapp%2Fsettings");

  await page.waitForURL(/\/app\/settings/);
});

test("should refuse a wrong password and an unknown email with the same words", async ({ page }) => {
  const { email } = createReviewer("wrong");
  const refusal = "That email and password do not match. Check both and try again.";

  const wrong = await signIn(page, email, "not-the-password-0123456789");
  await expect(wrong.getByRole("alert")).toHaveText(refusal);

  const unknown = await signIn(page, `nobody-${randomUUID().slice(0, 8)}@example.com`, "not-the-password-0123456789");
  await expect(unknown.getByRole("alert")).toHaveText(refusal);
  await expect(page).toHaveURL(/\/sign-in/);
});

test("should let a signed-out reviewer start from an MCP client's request, sign in with the password on the sign-in page, and approve it", async ({ page, request }) => {
  const { email, password } = createReviewer("oauth");
  const redirectUri = "http://127.0.0.1:9/callback";
  const registered = await request.post("/api/auth/oauth2/register", {
    headers: { "x-forwarded-for": `198.18.${String(randomInt(0, 256))}.${String(randomInt(1, 255))}` },
    data: { client_name: clientName, redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] },
  });
  expect(registered.status()).toBeLessThan(300);
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  clients.push(clientId);
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "reviewer-state",
  });
  const callback = page.waitForRequest((candidate) => candidate.url().startsWith(redirectUri));
  await page.route(`${redirectUri}**`, (route) => route.fulfill({ status: 200, body: "done" }));

  await setFreshNetwork(page);
  await page.goto(`/api/auth/oauth2/authorize?${authorize.toString()}`);
  await page.waitForURL(/\/sign-in\?next=/);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.waitForURL(/\/oauth\/consent/);
  await expect(page.getByRole("heading", { name: `Connect ${clientName}` })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  const returned = new URL((await callback).url());
  expect(returned.searchParams.get("state")).toBe("reviewer-state");
  expect(returned.searchParams.get("code")).toBeTruthy();
});
