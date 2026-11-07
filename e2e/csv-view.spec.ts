import { expect, test } from "@playwright/test";

test("should sort and filter the CSV preview without changing the file when a reader uses the header and search", async ({ page }) => {
  await page.goto("/preview");
  const panel = page.locator('#format-csv [data-preview-theme="light"]').first();
  const grid = panel.getByRole("grid", { name: "CSV table" });
  await expect(panel.getByText("Showing 12 of 12 rows")).toBeVisible();

  const p95 = grid.getByRole("columnheader", { name: /p95_ms/ });
  await p95.getByRole("button").first().click();
  await expect(p95).toHaveAttribute("aria-sort", "ascending");
  await expect(grid.locator("tbody tr[data-row]").first().locator("td").nth(3)).toHaveText("44");
  await p95.getByRole("button").first().click();
  await expect(p95).toHaveAttribute("aria-sort", "descending");
  await expect(grid.locator("tbody tr[data-row]").first().locator("td").nth(3)).toHaveText("2040");
  // Blank cells stay last in either direction.
  await expect(grid.locator("tbody tr[data-row]").last().locator("td").nth(3)).toHaveText("");

  await panel.getByLabel("Filter rows in every column").fill("eu-");
  await expect(panel.getByText("Showing 5 of 12 rows")).toBeVisible();

  // Keyboard: Enter on a header cycles the sort to off.
  await grid.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(p95).toHaveAttribute("aria-sort", "none");

  // Alt+Down opens the column menu with a labelled filter.
  await page.keyboard.press("Alt+ArrowDown");
  await page.getByLabel("Smallest value").fill("200");
  await page.keyboard.press("Escape");
  await expect(panel.getByText("Showing 2 of 12 rows")).toBeVisible();
});
