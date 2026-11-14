import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * The Permissions tab on /dev/team: the role matrix, locked cells, the New
 * role dialog, and the log of role changes. Fixture data, no database, so
 * nothing here saves; the server actions have their own unit tests.
 */

const matrix = (page: Page) => page.getByRole("table", { name: "Permissions by role" });

/** Hovers a locked cell until its tooltip shows; the first hover can land before the page hydrates. */
async function expectTooltip(page: Page, cell: string | RegExp, reason: string) {
  await expect(async () => {
    await page.mouse.move(0, 0);
    await matrix(page).getByRole("button", { name: cell }).hover();
    await expect(page.getByText(reason, { exact: true })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10_000 });
}

test("should let an owner toggle cells below Owner and lock every Owner cell", async ({ page }) => {
  await page.goto("/dev/team?tab=permissions");
  await expect(matrix(page).getByRole("checkbox", { name: "Approve sharing for Member" })).toBeEnabled();
  await expect(matrix(page).getByRole("checkbox", { name: "Change team settings for Admin" })).toBeEnabled();
  await expect(matrix(page).getByRole("checkbox", { name: /for Owner$/ })).toHaveCount(0);

  await expectTooltip(page, /^Approve sharing for Owner: Yes\. Locked/, "Owners always have every capability, so a team can always be run.");
});

test("should lock approval cells for agents and say why", async ({ page }) => {
  await page.goto("/dev/team?tab=permissions");
  await expect(matrix(page).getByRole("checkbox", { name: "Approve sharing for Agent" })).toHaveCount(0);
  await expect(matrix(page).getByRole("checkbox", { name: "See views for Agent" })).toBeEnabled();
  await expectTooltip(page, /^Approve sharing for Agent: No\. Locked/, "Agents never approve, share without asking, or manage the team.");
});

test("should keep an admin to roles below Admin and to capabilities the admin holds", async ({ page }) => {
  await page.goto("/dev/team?tab=permissions&as=admin");
  await expect(matrix(page).getByRole("checkbox", { name: /for Admin$/ })).toHaveCount(0);
  await expect(matrix(page).getByRole("checkbox", { name: "Approve sharing for Member" })).toBeEnabled();
  await expect(matrix(page).getByRole("checkbox", { name: "Manage themes for Designer" })).toBeEnabled();
  await expect(matrix(page).getByRole("checkbox", { name: "Change team settings for Member" })).toHaveCount(0);
  await expectTooltip(page, /^Approve sharing for Admin: Yes\. You can only change roles below your own\./, "You can only change roles below your own.");
});

test("should show a member the matrix read-only, with no New role button", async ({ page }) => {
  await page.goto("/dev/team?tab=permissions&as=member");
  await expect(matrix(page)).toBeVisible();
  await expect(matrix(page).getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New role" })).toHaveCount(0);
});

test("should check the name in the New role dialog before creating", async ({ page }) => {
  await page.goto("/dev/team?tab=permissions&as=admin");
  await page.getByRole("button", { name: "New role" }).click();
  const dialog = page.getByRole("dialog", { name: "New role" });
  await expect(dialog.getByText("Approve sharing", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Change team settings", { exact: true })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Create role" }).click();
  await expect(dialog.getByText("Give the role a name.")).toBeVisible();

  await dialog.getByLabel("Name", { exact: true }).fill("Admin");
  await dialog.getByRole("button", { name: "Create role" }).click();
  await expect(dialog.getByText("That name belongs to a built-in role.")).toBeVisible();
});

test("should list role changes with who made them", async ({ page }) => {
  await page.goto("/dev/team?tab=permissions&as=member");
  await expect(page.getByText("Ada Lovelace created the Designer role: Manage themes, See views.")).toBeVisible();
  await expect(page.getByText("Ada Lovelace changed Lin Designer's role from Member to Designer.")).toBeVisible();
});

test("should show a custom role in the members table and offer it to owners", async ({ page }) => {
  await page.goto("/dev/team");
  const role = page.getByRole("combobox", { name: "Role for Lin Designer" });
  await expect(role).toHaveText(/Designer/);
  await page.getByRole("combobox", { name: "Role for Bartholomew Longname-Featherstonehaugh" }).click();
  await expect(page.getByRole("option", { name: "Designer" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Agent" })).toHaveCount(0);
});
