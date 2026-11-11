import { expect, test } from "@playwright/test";

/** Autosave sends at most one save every 5 seconds (autosave-rules.ts), so "Saved" can take a little over that. */
const savedWithin = { timeout: 12_000 };

const notice = "An agent saved changes while you were editing. Your version is saved; theirs is in History.";

/**
 * A person's work wins over an agent's: on the editor fixture with
 * `?save=agent`, an agent saves a new summary just before the person's first
 * save, and that save goes through over it (as src/lib/artifact-save.ts
 * does). The editor says so, keeps what the person typed, and offers History.
 * No database: saves stay in memory.
 */
test("should keep the person's typing and say an agent's version is in History when their save lands over an agent's", async ({ page }) => {
  await page.goto("/dev/editor?kind=markdown&save=agent");
  const content = page.getByRole("textbox", { name: "Artifact content" });
  await expect(content).toBeVisible();
  const summary = page.getByRole("textbox", { name: "Summary" });
  const summaryBefore = await summary.inputValue();

  await content.getByText("A paragraph that runs long").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" My answer.");

  const shown = page.locator("[data-slot=agent-save-notice]");
  await expect(shown).toContainText(notice, savedWithin);
  // Nothing replaced what the person typed or sees: their summary stays, never the agent's.
  await expect(content).toContainText("My answer.");
  await expect(summary).toHaveValue(summaryBefore);
  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toHaveText("Saved", savedWithin);

  // Typing on goes on saving normally, with the notice still there until it is dismissed.
  await page.keyboard.type(" And more.");
  await expect(content).toContainText("My answer. And more.");

  await shown.getByRole("button", { name: "Open History" }).click();
  await expect(page.getByRole("dialog", { name: /^History of / })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /^History of / })).toHaveCount(0);

  await shown.getByRole("button", { name: "Dismiss" }).click();
  await expect(shown).toHaveCount(0);
});

test("should show no agent notice when no agent saved in between", async ({ page }) => {
  await page.goto("/dev/editor?kind=markdown");
  const content = page.getByRole("textbox", { name: "Artifact content" });
  await content.getByText("A paragraph that runs long").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Mine alone.");
  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toHaveText("Saved", savedWithin);
  await expect(page.locator("[data-slot=agent-save-notice]")).toHaveCount(0);
});
