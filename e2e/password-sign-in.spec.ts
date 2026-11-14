import type { Page } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

/**
 * Password sign-in in the browser, on a phone and a desktop viewport, with
 * the sign-in requests answered here so no database is needed:
 * - The public sign-in form (the fixture /dev/sign-in renders the real one)
 *   shows no password control to anyone who has not typed a reviewer-domain
 *   address, and nothing on it moves for an ordinary address.
 * - Typing an address under a reviewer domain (@artifacts.space; also
 *   @example.com outside production builds) reveals a password field with
 *   "Sign in" as the first action, while the emailed link stays available
 *   below it; after a link is asked for, the same domain alone (never an
 *   account) adds a way back to the password.
 * - The unlisted reviewer page signs in with a password, says what is wrong
 *   inline, and is never indexed or listed for crawlers.
 */

const linkButton = (page: Page) => page.getByRole("button", { name: "Email me a sign-in link" });
const passwordField = (page: Page) => page.getByLabel("Password", { exact: true });
const passwordButton = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The boxes of every control on the form, to compare before and after typing. */
async function controlBoxes(page: Page) {
  return page.locator("main").locator("button, input, a").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return `${element.tagName}:${element.textContent}:${String(Math.round(box.x))},${String(Math.round(box.y))},${String(Math.round(box.width))}x${String(Math.round(box.height))}`;
  }));
}

test.describe("the public sign-in page", () => {
  test("should show no password control and move nothing when an ordinary address is typed", async ({ page }) => {
    await page.goto("/dev/sign-in");
    await expect(linkButton(page)).toBeVisible();
    const before = await controlBoxes(page);
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.locator("main").getByText(/password/i)).toHaveCount(0);

    for (const address of ["someone@gmail.com", "someone@mail.artifacts.space", "someone@artifacts.space.evil.example"]) {
      await page.getByLabel("Email").fill(address);
      await expect(page.locator("input[type=password]"), address).toHaveCount(0);
      expect(await controlBoxes(page), address).toEqual(before);
    }
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("should never offer a password on the sign-up page, before or after a link is asked for", async ({ page }) => {
    await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ status: 200, json: { status: true } }));
    await page.goto("/dev/sign-in?mode=sign-up");
    await page.getByLabel("Email").fill("reviewer@artifacts.space");
    await expect(page.locator("input[type=password]")).toHaveCount(0);

    await linkButton(page).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText("If this account has a password, sign in with that instead.")).toHaveCount(0);
  });

  test("should reveal a password field for a reviewer-domain address and keep the emailed link", async ({ page }) => {
    await page.goto("/dev/sign-in");
    for (const address of ["Reviewer@Artifacts.Space", "reviewer@example.com"]) {
      await page.getByLabel("Email").fill(address);
      await expect(passwordField(page), address).toBeVisible();
      await expect(passwordField(page)).toHaveAttribute("autocomplete", "current-password");
      await expect(passwordButton(page)).toBeVisible();
      await expect(linkButton(page)).toBeVisible();
      expect(await pageOverflow(page), address).toBeLessThanOrEqual(0);
    }
    // Password sign-in is the first, full-width action; the emailed link follows it.
    const signIn = await passwordButton(page).boundingBox();
    const link = await linkButton(page).boundingBox();
    expect(signIn && link && signIn.y < link.y).toBe(true);
    expect(signIn?.width).toBe(link?.width);
    await page.getByLabel("Email").fill("reviewer@gmail.com");
    await expect(page.locator("input[type=password]")).toHaveCount(0);
  });

  test("should sign in with the password on Enter in the password field, and send a link only from the email field", async ({ page }) => {
    const asked: string[] = [];
    allowPageError("/api/auth/sign-in/email", "The test answers the password sign-in with a refusal on purpose.");
    await page.route("**/api/auth/sign-in/email", (route) => {
      asked.push("password");
      return route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } });
    });
    await page.route("**/api/auth/sign-in/magic-link", (route) => {
      asked.push("link");
      return route.fulfill({ status: 200, json: { status: true } });
    });
    await page.goto("/dev/sign-in");
    await page.getByLabel("Email").fill("reviewer@artifacts.space");
    await passwordField(page).fill("not-the-password");
    await passwordField(page).press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: "That email and password do not match. Check both and try again." })).toBeVisible();
    expect(asked).toEqual(["password"]);

    await page.getByLabel("Email").press("Enter");
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    expect(asked).toEqual(["password", "link"]);
  });

  test("should send one sign-in when Enter is pressed twice while the first is pending", async ({ page }) => {
    let sent = 0;
    let answer: (() => void) | undefined;
    const answered = new Promise<void>((resolve) => { answer = resolve; });
    allowPageError("/api/auth/sign-in/email", "The test answers the password sign-in with a refusal on purpose.");
    await page.route("**/api/auth/sign-in/email", async (route) => {
      sent += 1;
      await answered;
      return route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } });
    });
    await page.goto("/dev/sign-in");
    await page.getByLabel("Email").fill("reviewer@artifacts.space");
    await passwordField(page).fill("not-the-password");
    await passwordField(page).press("Enter");
    await passwordField(page).press("Enter");
    await expect.poll(() => sent).toBe(1);
    answer?.();

    await expect(page.getByRole("alert").filter({ hasText: "That email and password do not match." })).toBeVisible();
    expect(sent).toBe(1);
    await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
  });

  test("should point a reviewer-domain address back to its password after a link was asked for, and nobody else", async ({ page }) => {
    await page.route("**/api/auth/sign-in/magic-link", (route) => route.fulfill({ status: 200, json: { status: true } }));
    await page.goto("/dev/sign-in");
    await page.getByLabel("Email").fill("someone@gmail.com");
    await linkButton(page).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText("If this account has a password, sign in with that instead.")).toHaveCount(0);
    await page.getByRole("button", { name: "Use a different email" }).click();

    await page.getByLabel("Email").fill("reviewer@artifacts.space");
    await linkButton(page).click();
    await expect(page.getByText("If this account has a password, sign in with that instead.")).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Enter your password" }).click();

    await expect(passwordField(page)).toBeFocused();
    await expect(page.getByLabel("Email")).toHaveValue("reviewer@artifacts.space");
  });

  test("should ask for the password inline without sending anything when it is empty", async ({ page }) => {
    let sent = 0;
    allowPageError("/api/auth/sign-in/email", "The test answers the password sign-in with a refusal on purpose.");
    await page.route("**/api/auth/sign-in/email", (route) => {
      sent += 1;
      return route.fulfill({ status: 500, json: {} });
    });
    await page.goto("/dev/sign-in");
    await page.getByLabel("Email").fill("reviewer@artifacts.space");
    await passwordButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: "Enter your password." })).toBeVisible();
    expect(sent).toBe(0);
  });
});

test.describe("the unlisted reviewer page", () => {
  const form = (page: Page) => page.getByRole("form", { name: "Sign in with a password" });

  test("should be closed to search engines and missing from the sitemap and robots.txt", async ({ page, request }) => {
    await page.goto("/sign-in/reviewer");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /nofollow/);
    for (const path of ["/sitemap.xml", "/robots.txt"]) {
      const body = await (await request.get(path)).text();
      expect(body, path).not.toContain("reviewer");
    }
  });

  test("should offer a fillable form that says what is wrong inline", async ({ page }) => {
    const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/auth/sign-in/email") && candidate.method() === "POST");
    allowPageError("/api/auth/sign-in/email", "The test answers the password sign-in with a refusal on purpose.");
    await page.route("**/api/auth/sign-in/email", (route) => route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } }));
    await page.goto("/sign-in/reviewer");
    await expect(form(page).getByLabel("Email")).toHaveAttribute("autocomplete", "username");
    await expect(form(page).getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(await form(page).getAttribute("novalidate")).not.toBeNull();

    await form(page).getByRole("button", { name: "Sign in" }).click();
    await expect(form(page).getByRole("alert")).toHaveText("Enter your email address.");

    await form(page).getByLabel("Email").fill(" Reviewer@Example.com ");
    await form(page).getByLabel("Password").fill("not-the-password");
    await form(page).getByRole("button", { name: "Sign in" }).click();

    expect((await request).postDataJSON()).toEqual({ email: "Reviewer@Example.com", password: "not-the-password" });
    await expect(form(page).getByRole("alert")).toHaveText("That email and password do not match. Check both and try again.");
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("should show the server's wait when too many tries were made", async ({ page }) => {
    const wait = "You have tried to sign in to this email address a lot in the last few minutes. Try again in 9 minutes.";
    allowPageError("/api/auth/sign-in/email", "The test answers the password sign-in with a refusal on purpose.");
    await page.route("**/api/auth/sign-in/email", (route) => route.fulfill({ status: 429, json: { code: "RATE_LIMITED", message: wait } }));
    await page.goto("/sign-in/reviewer");
    await form(page).getByLabel("Email").fill("reviewer@example.com");
    await form(page).getByLabel("Password").fill("a-password");
    await form(page).getByRole("button", { name: "Sign in" }).click();

    await expect(form(page).getByRole("alert")).toHaveText(wait);
  });
});
