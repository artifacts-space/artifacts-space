import { expect, test, type Page } from "@playwright/test";

/**
 * The Team icon control and the icon in the team header, on /dev/team with
 * fixture data (no database or storage): who sees the control, the team's
 * pixel avatar when it has no icon, the image when it has one, and a phone layout
 * that does not overflow. The upload itself is checked in team-icon-db.spec.ts.
 */

const headerIcon = (page: Page) => page.getByRole("main").locator("[data-team-icon]").first();
const control = (page: Page) => page.getByRole("button", { name: "Team icon", exact: true });

test("should show the team's pixel avatar and an upload control to an owner when the team has no icon", async ({ page }) => {
  await page.goto("/dev/team");
  await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "avatar");
  await expect(headerIcon(page).locator("svg")).toHaveAttribute("data-avatar-kind", "team");
  await expect(headerIcon(page)).toHaveText("");
  await control(page).click();
  const dialog = page.getByRole("dialog", { name: "Team icon" });
  await expect(dialog.getByRole("button", { name: "Upload an image" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(dialog.getByText("PNG, JPEG, or WebP, up to 2 MB.", { exact: false })).toBeVisible();
  await expect(dialog.locator("form")).toHaveAttribute("novalidate", "");
});

test("should show the image with replace and remove when the team has an icon", async ({ page }) => {
  await page.goto("/dev/team?icon=1");
  await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "image");
  await control(page).click();
  const dialog = page.getByRole("dialog", { name: "Team icon" });
  await expect(dialog.getByRole("button", { name: "Replace image" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove" })).toBeVisible();
});

test("should show the team's pixel avatar instead when its icon cannot load", async ({ page }) => {
  await page.goto("/dev/team?icon=broken");
  await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "avatar");
  await expect(headerIcon(page).locator("svg")).toHaveAttribute("data-avatar-kind", "team");
  // The same avatar as a team with no icon at all: both are seeded by the team id.
  const drawing = (page: Page) => headerIcon(page).locator("svg").evaluate((svg) => [...svg.children].map((part) => `${getComputedStyle(part).fill} ${part.getAttribute("d") ?? ""}`));
  const fallback = await drawing(page);
  await page.goto("/dev/team");
  expect(await drawing(page)).toEqual(fallback);
});

test("should ask before removing the icon, with Don't ask again", async ({ page }) => {
  await page.goto("/dev/team?icon=1");
  await control(page).click();
  await page.getByRole("dialog", { name: "Team icon" }).getByRole("button", { name: "Remove" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove the team icon?" });
  await expect(confirm.getByText("Fixture team shows its pixel avatar again, and the image is deleted.", { exact: false })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Remove icon" })).toBeVisible();
  await expect(confirm.getByText("Don't ask again")).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
});

test("should show an error in the dialog when the picked file is not an allowed image", async ({ page }) => {
  await page.goto("/dev/team");
  await control(page).click();
  const dialog = page.getByRole("dialog", { name: "Team icon" });
  await dialog.getByLabel("Team icon image").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await expect(dialog.getByRole("alert")).toHaveText("Pick a PNG, JPEG, or WebP image.");
});

test.describe("people who cannot change team settings", () => {
  for (const role of ["admin", "member"] as const) {
    test(`should give no Team icon control to an ${role}, who still sees the icon`, async ({ page }) => {
      await page.goto(`/dev/team?as=${role}&icon=1`);
      await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "image");
      await expect(page.getByRole("button", { name: "Leave team" })).toBeVisible();
      await expect(control(page)).toHaveCount(0);
    });
  }

  test("should give a personal team the viewer's own avatar and no control", async ({ page }) => {
    await page.goto("/dev/team?personal=1&icon=1");
    await expect(headerIcon(page)).toHaveAttribute("data-team-icon", "avatar");
    await expect(headerIcon(page).locator("svg")).toHaveAttribute("data-avatar-kind", "person");
    await expect(control(page)).toHaveCount(0);
  });
});

test("should keep the team header within a phone screen when the control shows", async ({ page }) => {
  await page.goto("/dev/team?icon=1");
  await expect(control(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
