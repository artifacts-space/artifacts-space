import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * The sidebar's counts on /dev/workspace (the real workspace without a
 * database). With no filter on they cover every artifact, even past the
 * newest 100 the list holds (`?many=1` adds 300 older notes); with a
 * format, tag, or search filter on, every count is the matches.
 */

const views = (page: Page) => page.getByRole("navigation", { name: "Views" });
const tree = (page: Page) => page.getByRole("region", { name: "Projects" });

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  await expect(tree(page).getByRole("button", { name: /^Unfiled, / })).toBeVisible();
}

test("should count every artifact when the scope holds more than the newest 100, and show the rest from Show all", async ({ page }) => {
  await open(page, "/dev/workspace?many=1");
  await expect(views(page).getByRole("button", { name: /^All artifacts/ })).toContainText("340");
  await expect(views(page)).not.toContainText("newest");
  // 100 listed: Design's 2 and Research's 1, and 97 of Unfiled's 337 (340 less the 3 filed).
  await expect(tree(page).getByRole("button", { name: "Unfiled, 337 artifacts" })).toBeVisible();
  const unfiled = tree(page).getByRole("group", { name: "Unfiled" });
  await expect(unfiled.locator("li")).toHaveCount(97);
  await expect(unfiled).toContainText("Showing 97 of 337");
  await expect(tree(page).getByRole("group", { name: "Design" })).not.toContainText("Showing");
  await unfiled.getByRole("button", { name: "Show all 337 in Unfiled" }).click();
  await expect(page).toHaveURL(/project=/);
  await expect(unfiled.locator("li")).toHaveCount(100);
  await expect(unfiled).toContainText("Showing the newest 100 of 337. Search to find older ones.");
  await expect(unfiled.getByRole("button", { name: /^Show all/ })).toHaveCount(0);
  // The views now count the filtered list, which stops at 100, and say so.
  await expect(views(page).getByRole("button", { name: /^All artifacts/ })).toContainText("100");
  await expect(views(page)).toContainText("Counts cover the newest 100 only.");
});

test("should count only the matches in the views and the tree when a format filter is on", async ({ page }) => {
  await open(page, "/dev/workspace");
  await expect(views(page).getByRole("button", { name: /^All artifacts/ })).toContainText("40");
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("combobox", { name: "Filter by format" }).click();
  await page.getByRole("option", { name: "csv", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(views(page).getByRole("button", { name: /^All artifacts/ })).toContainText("1");
  await expect(tree(page).getByRole("button", { name: "Research, 1 artifact" })).toBeVisible();
  await expect(tree(page).getByRole("group", { name: "Design" })).toHaveCount(0);
  await expect(tree(page).getByRole("group", { name: "Unfiled" })).toHaveCount(0);
});

test("should count only the tagged artifacts in the views and the tree when a tag filter is on", async ({ page }) => {
  // Long csv (in Research), Note 4, and Note 5 carry "launch".
  await open(page, "/dev/workspace?tag=launch");
  await expect(views(page).getByRole("button", { name: /^All artifacts/ })).toContainText("3");
  await expect(tree(page).getByRole("button", { name: "Research, 1 artifact" })).toBeVisible();
  await expect(tree(page).getByRole("button", { name: "Unfiled, 2 artifacts" })).toBeVisible();
  await expect(tree(page).getByRole("group", { name: "Design" }), "a project with no matches leaves the tree").toHaveCount(0);
  await expect(tree(page).getByRole("button", { name: /^(Hide|Show) the artifacts in / }), "every group with matches stays open").toHaveCount(0);
  await expect(tree(page).locator("li")).toHaveCount(3);
});
