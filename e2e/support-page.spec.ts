import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/** True when the page itself scrolls sideways. */
async function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test("should show every way to get help when the support page opens", async ({ page }) => {
  await page.goto("/support");

  await expect(page).toHaveTitle("Support · artifacts.space");
  await expect(page.getByRole("heading", { level: 1, name: "Get help" })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "support@artifacts.space" })).toHaveAttribute("href", "mailto:support@artifacts.space");
  await expect(main.getByText("Something's not working")).toBeVisible();
  await expect(main.getByRole("link", { name: "docs", exact: true })).toHaveAttribute("href", "/docs");
  await expect(main.getByRole("link", { name: "Troubleshooting" })).toHaveAttribute("href", "/docs/quickstart#troubleshooting");
  await expect(main.getByRole("link", { name: /public issue tracker/ })).toHaveAttribute("href", "https://github.com/artifacts-space/artifacts-space/issues");
  expect(await pageScrollsSideways(page)).toBe(false);
});

test("should open the support page from the footer beside Privacy and Terms", async ({ page }) => {
  await page.goto("/privacy");

  const footer = page.getByRole("navigation", { name: "Footer" });
  const labels = await footer.getByRole("link").allInnerTexts();
  expect(labels.slice(labels.indexOf("Support"))).toEqual(["Support", "Privacy", "Terms"]);
  expect(await pageScrollsSideways(page)).toBe(false);

  await footer.getByRole("link", { name: "Support" }).click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByRole("heading", { level: 1, name: "Get help" })).toBeVisible();
});

test("should state the 30-day session length when the privacy policy opens", async ({ page }) => {
  await page.goto("/privacy");

  await expect(page.getByText("a session ends when you sign out or 30 days after you last use it.")).toBeVisible();
});

test("should answer 404 at the OpenAI domain check when no token is set", async ({ request }) => {
  const response = await request.get("/.well-known/openai-apps-challenge");

  expect(response.status()).toBe(404);
});
