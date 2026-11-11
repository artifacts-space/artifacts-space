import { expect, test, type Page } from "@playwright/test";

/**
 * "Continue with Google" on the sign-in form, on a phone and a desktop
 * viewport: shown only when Google is configured, under GitHub, and sending
 * the person to the same place GitHub does. The fixture page
 * (/dev/sign-in) renders the real form with Google on or off, and the
 * sign-in request is answered here, so nothing reaches Google.
 */

const google = (page: Page) => page.getByRole("button", { name: "Continue with Google" });
const github = (page: Page) => page.getByRole("button", { name: "Continue with GitHub" });

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Clicks Google and returns what the form asked Better Auth for. The request is refused here, so the page stays put. */
async function startGoogle(page: Page) {
  const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/auth/sign-in/social") && candidate.method() === "POST");
  await page.route("**/api/auth/sign-in/social", (route) => route.fulfill({ status: 400, json: { message: "Stopped by the test." } }));
  await google(page).click();
  const body: unknown = (await request).postDataJSON();
  await expect(page.getByRole("alert").filter({ hasText: "Stopped by the test." })).toBeVisible();
  return body;
}

test("should show Continue with Google under GitHub, the same size, when Google is configured", async ({ page }) => {
  for (const mode of ["sign-in", "sign-up"]) {
    await page.goto(`/dev/sign-in?google=1&mode=${mode}`);
    await expect(google(page), mode).toBeVisible();
    const [githubBox, googleBox] = await Promise.all([github(page).boundingBox(), google(page).boundingBox()]);
    if (!githubBox || !googleBox) throw new Error("A sign-in button has no box.");
    expect(googleBox.y, mode).toBeGreaterThan(githubBox.y);
    expect(googleBox.width, mode).toBe(githubBox.width);
    expect(googleBox.height, mode).toBe(githubBox.height);
    await expect(google(page).locator("[data-slot=google-mark]"), mode).toBeVisible();
    expect(await pageOverflow(page), mode).toBeLessThanOrEqual(0);
  }
});

test("should hide Continue with Google when Google is not configured", async ({ page }) => {
  await page.goto("/dev/sign-in");
  await expect(github(page)).toBeVisible();
  await expect(google(page)).toHaveCount(0);
});

test("should hide Continue with Google on the real sign-in and sign-up pages when the server has no Google credentials", async ({ page }) => {
  for (const path of ["/sign-in", "/sign-up"]) {
    await page.goto(path);
    await expect(github(page), path).toBeVisible();
    await expect(google(page), path).toHaveCount(0);
  }
});

test("should send Google sign-in back to the invitation when the person came from one", async ({ page, baseURL }) => {
  await page.goto("/dev/sign-in?google=1&next=%2Finvitations%2Finv-123");

  expect(await startGoogle(page)).toEqual({
    provider: "google",
    callbackURL: `${baseURL ?? ""}/invitations/inv-123`,
    errorCallbackURL: `${baseURL ?? ""}/dev/sign-in?next=%2Finvitations%2Finv-123`,
  });
});

test("should send Google sign-in to the workspace when next points to another site", async ({ page, baseURL }) => {
  await page.goto("/dev/sign-in?google=1&next=%2F%2Fevil.example%2Fsteal");

  expect(await startGoogle(page)).toEqual({ provider: "google", callbackURL: `${baseURL ?? ""}/app`, errorCallbackURL: `${baseURL ?? ""}/dev/sign-in` });
});

test("should explain in the page's own neutral words when Google refused the address", async ({ page }) => {
  await page.goto("/dev/sign-in?google=1&error=google_email_not_verified&error_description=Call%20555-0100");

  await expect(page.getByRole("alert").filter({ hasText: "We could not sign you in with that account. Use an email link to your address instead." })).toBeVisible();
  await expect(page.getByText("555-0100")).toHaveCount(0);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

test("should show a plain fallback when a sign-in comes back with an unknown error", async ({ page }) => {
  for (const code of ["something_else", "__proto__", "toString"]) {
    await page.goto(`/dev/sign-in?error=${code}`);
    await expect(page.getByRole("alert").filter({ hasText: "Sign-in did not finish. Try again, or use an email link." }), code).toBeVisible();
  }
});
