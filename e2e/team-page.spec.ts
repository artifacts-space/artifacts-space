import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * The team page's tabs, deep links, member dialogs, and phone layout,
 * measured on /dev/team: the real team page with fixture data and no
 * database. `?as=` picks the viewer's role.
 */

const tabs = (page: Page) => page.getByRole("tablist", { name: "Team sections" });
const views = (page: Page) => page.getByRole("tablist", { name: "Shared artifacts views" });
const membersTable = (page: Page) => page.getByRole("table", { name: "Members" });

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("should change the URL when the person switches tabs and views", async ({ page }) => {
  await page.goto("/dev/team");
  await expect(tabs(page).getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");

  await tabs(page).getByRole("tab", { name: "Permissions" }).click();
  await expect(page).toHaveURL(/\/dev\/team\?tab=permissions$/);
  await expect(page.getByRole("table", { name: "Permissions by role" })).toBeVisible();

  await tabs(page).getByRole("tab", { name: /^Shared artifacts/ }).click();
  await expect(page).toHaveURL(/\?tab=artifacts$/);
  await expect(page.getByRole("table", { name: "Shared artifacts" })).toBeVisible();

  await views(page).getByRole("tab", { name: /^Needs approval/ }).click();
  await expect(page).toHaveURL(/\?tab=artifacts&view=approval$/);
  await expect(page.getByText("Incident review")).toBeVisible();

  await tabs(page).getByRole("tab", { name: "Themes" }).click();
  await expect(page).toHaveURL(/\?tab=themes$/);
  await expect(page.getByRole("heading", { name: "Themes" })).toBeVisible();
});

test("should open the tab and view named in a deep link, and keep them on reload", async ({ page }) => {
  await page.goto("/dev/team?tab=artifacts&view=approval");
  await expect(tabs(page).getByRole("tab", { name: /^Shared artifacts/ })).toHaveAttribute("aria-selected", "true");
  await expect(views(page).getByRole("tab", { name: /^Needs approval/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Sharing requests" })).toBeVisible();

  await page.reload();
  await expect(views(page).getByRole("tab", { name: /^Needs approval/ })).toHaveAttribute("aria-selected", "true");
});

test("should count what needs approval on the tab and the view when requests wait", async ({ page }) => {
  await page.goto("/dev/team");
  await expect(tabs(page).getByRole("tab", { name: "Shared artifacts 2" })).toBeVisible();
  await tabs(page).getByRole("tab", { name: /^Shared artifacts/ }).click();
  await expect(views(page).getByRole("tab", { name: "Needs approval 2" })).toBeVisible();
});

test("should open Members when the URL names an unknown tab", async ({ page }) => {
  await page.goto("/dev/team?tab=billing");
  await expect(tabs(page).getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
});

test("should hide approvals and member controls when the viewer is a plain member", async ({ page }) => {
  await page.goto("/dev/team?as=member&tab=artifacts&view=approval");
  await expect(tabs(page).getByRole("tab", { name: "Shared artifacts" })).toHaveAttribute("aria-selected", "true");
  await expect(views(page)).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Shared artifacts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw" })).toHaveCount(0);

  await tabs(page).getByRole("tab", { name: "Members" }).click();
  await expect(page.getByRole("button", { name: "Invite people" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add agent" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
});

test("should show only Members and Shared artifacts when the team is personal", async ({ page }) => {
  await page.goto("/dev/team?personal=1&tab=themes");
  await expect(tabs(page).getByRole("tab")).toHaveText(["Members", "Shared artifacts"]);
  await expect(tabs(page).getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
});

test("should list people, agents, and invitations in one table", async ({ page }) => {
  await page.goto("/dev/team");
  const table = membersTable(page);
  await expect(table.locator("[data-member-row=person]")).toHaveCount(5);
  await expect(table.locator("[data-member-row=agent]")).toHaveCount(3);
  await expect(table.locator("[data-member-row=invitation]")).toHaveCount(3);
  await expect(table.locator("[data-member-row=agent]").first().getByText("Agent", { exact: true }).first()).toBeVisible();
  await expect(table.locator("[data-member-row=invitation]").first()).toContainText("Invited · expires Nov 15, 2026");
});

test("should line every row up with the table's header", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Alignment is measured once, on the desktop viewport.");
  await page.goto("/dev/team");
  const lefts = await membersTable(page).evaluate((table) => {
    const contentLeft = (cell: Element) => cell.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(cell).paddingLeft);
    return Array.from(table.querySelectorAll("tr")).map((row) => {
      const first = row.firstElementChild;
      return first ? Math.round(contentLeft(first)) : -1;
    });
  });
  expect(new Set(lefts).size, `first-column content starts at ${lefts.join(", ")}`).toBe(1);
});

test("should offer Resend and Cancel for an invitation, and Remove for a member", async ({ page }) => {
  await page.goto("/dev/team");
  await page.getByRole("button", { name: "Actions for the invitation to new.teammate@example.com" }).click();
  await expect(page.getByRole("menuitem", { name: "Resend" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Cancel invitation" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Actions for Grace Hopper" }).click();
  await expect(page.getByRole("menuitem", { name: "Remove from team" })).toBeVisible();
});

test("should never offer to change an owner when the viewer is an admin", async ({ page }) => {
  await page.goto("/dev/team?as=admin");
  await expect(page.getByRole("button", { name: "Actions for Ada Lovelace" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Role for Ada Lovelace" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Role for Grace Hopper" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Role for Bartholomew Longname-Featherstonehaugh" })).toBeVisible();
});

test("should check the email in the invite dialog before sending", async ({ page }) => {
  await page.goto("/dev/team");
  await page.getByRole("button", { name: "Invite people" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite people" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email").fill("not-an-email");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid email address.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Reopened, the form starts empty.
  await page.getByRole("button", { name: "Invite people" }).click();
  await expect(page.getByRole("dialog", { name: "Invite people" }).getByLabel("Email")).toHaveValue("");
});

test("should ask for a handle and a name in the add-agent dialog", async ({ page }) => {
  await page.goto("/dev/team");
  await page.getByRole("button", { name: "Add agent" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an agent" });
  await dialog.getByRole("button", { name: "Add agent" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Give the agent a handle and a name.");
});

test("should open an agent's tokens from its menu", async ({ page }) => {
  await page.goto("/dev/team");
  await page.getByRole("button", { name: "Actions for @planner" }).click();
  await page.getByRole("menuitem", { name: "Tokens" }).click();
  const dialog = page.getByRole("dialog", { name: "Tokens for @planner" });
  await expect(dialog.getByRole("status")).toContainText("left the team");
  await expect(dialog.getByLabel("New token name for @planner")).toBeVisible();
});

test("should never scroll sideways on a phone, on any tab", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Phone width only.");
  for (const path of ["/dev/team", "/dev/team?tab=permissions", "/dev/team?tab=artifacts", "/dev/team?tab=artifacts&view=approval", "/dev/team?tab=artifacts&view=reports", "/dev/team?tab=themes"]) {
    await page.goto(path);
    await expect(tabs(page)).toBeVisible();
    expect(await pageOverflow(page), path).toBeLessThanOrEqual(0);
  }
  await page.goto("/dev/team");
  await page.getByRole("button", { name: "Invite people" }).click();
  await expect(page.getByRole("dialog", { name: "Invite people" })).toBeVisible();
  expect(await pageOverflow(page), "invite dialog").toBeLessThanOrEqual(0);
});
