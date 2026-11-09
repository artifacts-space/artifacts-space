import { expect, test, type Page } from "@playwright/test";

/**
 * Notification settings with browser notifications set up, on the component
 * gallery (no database). Browser notifications must never ask for permission
 * or register a service worker until the person clicks Turn on.
 */

/**
 * Opens the notifications specimen once the gallery has settled. The gallery
 * draws its Mermaid diagrams on the main thread, which on a busy CI runner
 * holds back hydration and the browser check for several seconds.
 */
async function openSpecimen(page: Page) {
  await page.goto("/dev/components#notifications");
  await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });
}

test("should offer in-app, browser, and email choices with email only for mentions", async ({ page }) => {
  await openSpecimen(page);
  const table = page.getByRole("table", { name: "Notification settings" });
  await expect(table.getByRole("switch", { name: "Browser: Mentions" })).not.toBeChecked();
  await expect(table.getByRole("switch", { name: "In app: Replies" })).toBeChecked();
  await expect(table.getByRole("switch", { name: "Email: Mentions" })).toBeChecked();
  await expect(table.getByRole("switch", { name: "Email: Replies" })).toHaveCount(0);
  // Where an event has no email, the cell shows a quiet dash instead of a disabled switch.
  const replies = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /^Replies/ }) });
  await expect(replies.getByRole("cell").last()).toHaveText("–");
});

test("should list the browsers with a remove button and a test button", async ({ page }) => {
  await openSpecimen(page);
  await expect(page.getByText("Chrome on macOS")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Safari on iOS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send a test notification" })).toBeEnabled();
  await page.getByRole("button", { name: "Remove Safari on iOS" }).click();
  await expect(page.getByRole("dialog", { name: "Remove this browser?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("should not ask for permission or register a service worker when the page loads", async ({ page }) => {
  // Count permission prompts and registrations; headless Chromium reports "denied" without prompting.
  await page.addInitScript(() => {
    const counts = { prompts: 0, registrations: 0 };
    Object.assign(window, { pushCounts: counts });
    const ask = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = (...args) => {
      counts.prompts += 1;
      return ask(...args);
    };
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...args) => {
      counts.registrations += 1;
      return register(...args);
    };
  });
  await openSpecimen(page);
  await expect(page.getByRole("button", { name: "Turn on in this browser" })).toBeVisible();
  const state = await page.evaluate(async () => ({
    counts: (window as unknown as { pushCounts: { prompts: number; registrations: number } }).pushCounts,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(state).toEqual({ counts: { prompts: 0, registrations: 0 }, workers: 0 });
});
