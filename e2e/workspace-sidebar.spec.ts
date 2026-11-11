import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The workspace sidebar and the artifact header, on /dev/workspace (the real
 * workspace without a database): the "/" shortcut, the filters behind their
 * button, the views, the workspace switcher, and the breadcrumb, chips, and
 * meta line around the open artifact, and a new member's welcome card on a
 * team workspace.
 */

const slot = (page: Page, name: string) => page.locator(`[data-slot=${name}]`);

async function openWorkspace(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "the phone checks are in app-shell.spec.ts");

  test("should focus the search when / is pressed outside a field, and type / in a field", async ({ page }) => {
    await openWorkspace(page);
    const search = page.getByRole("textbox", { name: "Search artifacts" });
    await slot(page, "detail-body").focus();
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await page.keyboard.press("/");
    await expect(search, "a / typed in the search stays in it").toHaveValue("/");
  });

  test("should leave / to an open dialog or menu instead of pulling focus to the search", async ({ page }) => {
    await openWorkspace(page);
    // By its label, not its role: an open modal hides the rest of the page from the accessibility tree.
    const search = page.locator("input[aria-label='Search artifacts']");
    await page.getByRole("button", { name: "Share settings" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const inside = dialog.getByRole("button").first();
    await inside.focus();
    await page.keyboard.press("/");
    await expect(inside, "focus stays in the dialog").toBeFocused();
    await expect(search).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Workspace: Your artifacts. Switch workspace" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("/");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(search, "the open menu keeps the key").not.toBeFocused();
  });

  test("should open the filters from the button beside the search and count the ones that are on", async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole("button", { name: "Filters" }).click();
    const format = page.getByRole("combobox", { name: "Filter by format" });
    await format.click();
    await page.getByRole("option", { name: "json", exact: true }).click();
    await expect(format).toContainText("json");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Filters, 1 on" })).toBeVisible();
    await expect(slot(page, "artifact-list").getByText("Long json fixture", { exact: true })).toBeVisible();
    await expect(slot(page, "artifact-list").getByText("Long csv fixture", { exact: true })).toHaveCount(0);
  });

  test("should narrow the tree to a view and show each view's count", async ({ page }) => {
    await openWorkspace(page);
    const views = page.getByRole("navigation", { name: "Views" });
    const all = views.getByRole("button", { name: /^All artifacts/ });
    const shown = views.getByRole("button", { name: /^Public/ });
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(all).toContainText("40");
    await expect(shown).toContainText("0");
    await shown.click();
    await expect(shown).toHaveAttribute("aria-pressed", "true");
    await expect(slot(page, "artifact-list").locator("li")).toHaveCount(0);
    await expect(slot(page, "artifact-list")).toContainText("No artifacts match.");
    await slot(page, "artifact-list").getByRole("button", { name: "Clear filters" }).click();
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(slot(page, "artifact-list").locator("li")).toHaveCount(40);
  });

  test("should count only the matches and keep every matching project open while a search narrows the tree", async ({ page }) => {
    await openWorkspace(page);
    const tree = page.getByRole("region", { name: "Projects" });
    await expect(tree.getByRole("button", { name: "Design, 2 artifacts" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search artifacts" }).fill("Long ui");
    await expect(tree.getByRole("button", { name: "Design, 1 artifact" })).toBeVisible();
    await expect(tree.getByRole("button", { name: /^(Hide|Show) the artifacts in / })).toHaveCount(0);
    await expect(tree.getByRole("button", { name: /every project$/ })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Search artifacts" }).fill("");
    await expect(tree.getByRole("button", { name: "Design, 2 artifacts" })).toBeVisible();
    await expect(tree.getByRole("button", { name: "Close every project" })).toBeVisible();
  });

  test("should show the open artifact's project and title in the top bar and its format, project, and tags under the title", async ({ page }) => {
    await openWorkspace(page);
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).toContainText("Design");
    await expect(crumbs.locator("[aria-current=page]")).toHaveText("Long ui fixture");
    await expect(page.getByRole("button", { name: "Format: Interface. Change format" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Project: Design. Change project" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Add a tag" })).toBeVisible();
    await expect(slot(page, "save-status")).toContainText(/chars/);
    await expect(page.getByRole("button", { name: "Copy the artifact id" })).toBeVisible();
    // The title lines up with the content's column, inside its 24px padding.
    const title = await page.getByRole("textbox", { name: "Artifact title" }).boundingBox();
    const column = await slot(page, "detail-body").locator("[data-slot=page-column]").first().boundingBox();
    expect(Math.abs((title?.x ?? 0) - ((column?.x ?? 0) + 24)), "the title starts where the column's text does").toBeLessThanOrEqual(2);
  });

});

test("should name the team in the workspace switcher and the heading, and offer no New artifact on a team workspace", async ({ page }) => {
  await page.goto("/dev/workspace?scopes=1&team=fixture-shared-2");
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
  const switcher = page.getByRole("button", { name: "Workspace: Customer research. Switch workspace" });
  await expect(switcher).toContainText("Team workspace");
  await expect(page.getByRole("heading", { level: 1, name: "Shared with Customer research" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "New artifact" }), "team workspaces list others' work").toHaveCount(0);
  await switcher.click();
  await expect(page.getByRole("menuitem", { name: /Customer research/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("menuitem", { name: /Your artifacts/ })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("menuitem", { name: "Manage teams" })).toHaveAttribute("href", "/teams");
  // Real links, so middle-click and Open in new tab work.
  await expect(page.getByRole("menuitem", { name: /Your artifacts/ })).toHaveAttribute("href", "/dev/workspace");
  await page.getByRole("menuitem", { name: /Your artifacts/ }).click();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
  await expect(page.getByRole("button", { name: "Workspace: Your artifacts. Switch workspace" })).toContainText("Personal workspace");
});

test("should mark each workspace with its avatar: the viewer's own, a team's icon, or the team's pixel avatar", async ({ page }) => {
  await page.goto("/dev/workspace?scopes=1&team=fixture-shared-0");
  const switcher = page.getByRole("button", { name: "Workspace: Design. Switch workspace" });
  const triggerAvatar = switcher.locator("[data-team-icon=avatar]");
  await expect(triggerAvatar.locator("svg")).toHaveAttribute("data-avatar-kind", "team");
  // Computed, since the server and the browser write the same style with different spacing.
  const tint = (avatar: Locator) => avatar.locator("rect").evaluate((rect) => getComputedStyle(rect).fill);
  const triggerTint = await tint(triggerAvatar);
  await switcher.click();
  const avatarIn = (name: RegExp) => page.getByRole("menuitem", { name }).locator("[data-team-icon]");
  await expect(avatarIn(/Your artifacts/).locator("svg")).toHaveAttribute("data-avatar-kind", "person");
  await expect(avatarIn(/Design/).locator("svg")).toHaveAttribute("data-avatar-kind", "team");
  // Drawn at the row's size, not shrunk to the menu's 16px icon size.
  await expect.poll(async () => (await avatarIn(/Your artifacts/).locator("svg").boundingBox())?.width).toBe(24);
  await expect(avatarIn(/Platform engineering/)).toHaveAttribute("data-team-icon", "image");
  await expect(avatarIn(/Platform engineering/)).toHaveAttribute("alt", "");
  // Seeded by team id: two teams without icons never share an avatar, and the trigger draws the same colors as the row.
  expect(await avatarIn(/Customer research/).innerHTML()).not.toBe(await avatarIn(/Design/).innerHTML());
  expect(await tint(avatarIn(/Design/))).toBe(triggerTint);
  // Decorative: the name beside each avatar is what screen readers hear.
  await expect(avatarIn(/Customer research/).locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("menuitem", { name: /Customer research/ })).toHaveAccessibleName("Customer research");
});


test("should show a new member's welcome card on the team workspace until they close it", async ({ page }) => {
  await page.goto("/dev/workspace?scopes=1&team=fixture-shared-0&welcome=1");
  const card = slot(page, "team-welcome");
  await expect(card.getByRole("heading", { name: "Welcome to Design" })).toBeVisible();
  // What the member can do comes first, then the rule for sharing outside, then the actions.
  await expect(card.getByRole("paragraph")).toHaveText(
    "You can edit the team's artifacts right away. Sharing by link or in public needs approval from someone who can approve sharing (owners and admins by default). Edits to those artifacts reach outside readers once approved.",
  );
  await expect(card.getByRole("link", { name: "How this team works" })).toHaveAttribute("href", "/teams/fixture-shared-0");
  const copyBox = await card.getByRole("paragraph").boundingBox();
  const buttonBox = await card.getByRole("button", { name: "Got it" }).boundingBox();
  expect(buttonBox?.y ?? 0, "the actions sit below the copy").toBeGreaterThan((copyBox?.y ?? 0) + (copyBox?.height ?? 0) - 1);

  await card.getByRole("button", { name: "Got it" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Shared with Design" }), "focus lands on the workspace heading, not the page body").toBeFocused();
  await expect(page.getByText("Checkout v2 rollout").first(), "the workspace stays open").toBeVisible();
});

test("should bring the welcome card back with the error when closing it cannot be saved", async ({ page }) => {
  await page.goto("/dev/workspace?scopes=1&team=fixture-shared-0&welcome=fails");
  const card = slot(page, "team-welcome");
  await expect(card.getByRole("heading", { name: "Welcome to Design" })).toBeVisible();
  await card.getByRole("button", { name: "Got it" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Could not close the welcome. Try again." })).toBeVisible();
  await expect(card.getByRole("heading", { name: "Welcome to Design" }), "the card comes back, so it is not silently lost").toBeVisible();
});

test("should show no welcome card on the viewer's own workspace or when the server hides it", async ({ page }) => {
  await page.goto("/dev/workspace?scopes=1&welcome=1");
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
  await expect(slot(page, "team-welcome")).toHaveCount(0);
  await page.goto("/dev/workspace?scopes=1&team=fixture-shared-0");
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
  await expect(slot(page, "team-welcome")).toHaveCount(0);
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "touch targets on a phone");

  test("should give every small control in the tree and the meta line a 44px touch target", async ({ page }) => {
    await openWorkspace(page);
    const tree = page.getByRole("region", { name: "Projects" });
    const targets = [
      tree.getByRole("button", { name: "Hide the artifacts in Design" }),
      tree.getByRole("button", { name: "Options for Design" }),
      tree.getByRole("button", { name: "Move to project" }).first(),
      tree.getByRole("button", { name: "New project" }),
      tree.getByRole("button", { name: "Close every project" }),
      page.getByRole("button", { name: "Copy the artifact id" }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box?.width ?? 0, String(target)).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, String(target)).toBeGreaterThanOrEqual(44);
    }
  });

  test("should give every workspace switcher item a 44px touch target", async ({ page }) => {
    await page.goto("/dev/workspace?scopes=1");
    await page.getByRole("button", { name: "Workspace: Your artifacts. Switch workspace" }).click();
    const items = page.getByRole("menuitem");
    await expect(items).toHaveCount(6);
    for (const item of await items.all()) {
      // Polled: the menu grows in from 95% as it opens.
      await expect.poll(async () => (await item.boundingBox())?.height ?? 0, await item.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test("should give the welcome card's actions a 44px touch target and never scroll sideways", async ({ page }) => {
    await page.goto("/dev/workspace?scopes=1&team=fixture-shared-0&welcome=1");
    const card = slot(page, "team-welcome");
    await expect(card).toBeVisible();
    for (const target of [card.getByRole("button", { name: "Got it" }), card.getByRole("link", { name: "How this team works" })]) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0, String(target)).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
