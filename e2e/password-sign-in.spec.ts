import { expect, test, type Page } from "@playwright/test";

/**
 * "Sign in with a password" on the sign-in form, on a phone and a desktop
 * viewport: a quiet link below every other option that opens a small form
 * in a dialog, so the main options never move; password managers can fill it;
 * it says what is wrong inline; and the page never scrolls sideways. The
 * fixture page (/dev/sign-in) renders the real form, and the sign-in
 * request is answered here, so no database is needed.
 */

const toggle = (page: Page) => page.getByRole("button", { name: "Sign in with a password" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Sign in with a password" });
const form = (page: Page) => dialog(page).getByRole("form", { name: "Sign in with a password" });
const github = (page: Page) => page.getByRole("button", { name: "Continue with GitHub" });

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("should offer the password option below every other way in, closed", async ({ page }) => {
  await page.goto("/dev/sign-in");
  await expect(toggle(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);

  const [toggleBox, linkButtonBox, switchBox] = await Promise.all([
    toggle(page).boundingBox(),
    page.getByRole("button", { name: "Email me a sign-in link" }).boundingBox(),
    page.getByRole("link", { name: "Create one" }).boundingBox(),
  ]);
  if (!toggleBox || !linkButtonBox || !switchBox) throw new Error("A sign-in control has no box.");
  expect(toggleBox.y).toBeGreaterThan(linkButtonBox.y);
  expect(toggleBox.y).toBeGreaterThan(switchBox.y);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

test("should not offer a password on the sign-up page", async ({ page }) => {
  await page.goto("/dev/sign-in?mode=sign-up");
  await expect(github(page)).toBeVisible();
  await expect(toggle(page)).toHaveCount(0);
});

test("should open a small form in a dialog without moving the main options", async ({ page }) => {
  await page.goto("/dev/sign-in");
  // A modal dialog hides the page from the accessibility tree, so measure the button by its text.
  const githubButton = page.locator("button", { hasText: "Continue with GitHub" });
  const before = await githubButton.boundingBox();
  await toggle(page).click();

  await expect(form(page)).toBeVisible();
  const email = form(page).getByLabel("Email");
  const password = form(page).getByLabel("Password");
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(email).toHaveAttribute("type", "email");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(password).toHaveAttribute("type", "password");
  expect(await form(page).getAttribute("novalidate")).not.toBeNull();

  const [after, box] = await Promise.all([githubButton.boundingBox(), dialog(page).boundingBox()]);
  if (!before || !after || !box) throw new Error("The GitHub button or the dialog has no box.");
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(toggle(page)).toBeFocused();
});

test("should ask for each missing field inline without sending anything", async ({ page }) => {
  let sent = 0;
  await page.route("**/api/auth/sign-in/email", (route) => {
    sent += 1;
    return route.fulfill({ status: 500, json: {} });
  });
  await page.goto("/dev/sign-in");
  await toggle(page).click();

  await form(page).getByRole("button", { name: "Sign in" }).click();
  await expect(form(page).getByRole("alert")).toHaveText("Enter your email address.");

  await form(page).getByLabel("Email").fill("reviewer@example.com");
  await form(page).getByRole("button", { name: "Sign in" }).click();
  await expect(form(page).getByRole("alert")).toHaveText("Enter your password.");
  expect(sent).toBe(0);
});

test("should show one inline refusal and stay on the page when the password is wrong", async ({ page }) => {
  const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/auth/sign-in/email") && candidate.method() === "POST");
  await page.route("**/api/auth/sign-in/email", (route) => route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } }));
  await page.goto("/dev/sign-in");
  await toggle(page).click();

  await form(page).getByLabel("Email").fill(" Reviewer@Example.com ");
  await form(page).getByLabel("Password").fill("not-the-password");
  await form(page).getByRole("button", { name: "Sign in" }).click();

  expect((await request).postDataJSON()).toEqual({ email: "Reviewer@Example.com", password: "not-the-password" });
  await expect(form(page).getByRole("alert")).toHaveText("That email and password do not match. Check both and try again.");
  await expect(page).toHaveURL(/\/dev\/sign-in$/);
  await expect(form(page).getByLabel("Password")).toHaveValue("not-the-password");
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

test("should show the server's wait when too many tries were made", async ({ page }) => {
  const wait = "This email address has had a lot of password sign-in tries in the last few minutes. Try again in 9 minutes.";
  await page.route("**/api/auth/sign-in/email", (route) => route.fulfill({ status: 429, json: { code: "RATE_LIMITED", message: wait } }));
  await page.goto("/dev/sign-in");
  await toggle(page).click();

  await form(page).getByLabel("Email").fill("reviewer@example.com");
  await form(page).getByLabel("Password").fill("a-password");
  await form(page).getByRole("button", { name: "Sign in" }).click();

  await expect(form(page).getByRole("alert")).toHaveText(wait);
});
