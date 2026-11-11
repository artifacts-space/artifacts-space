import { expect, test, type Page } from "@playwright/test";

/**
 * The workspace sidebar and the artifact header, on /dev/workspace (the real
 * workspace without a database): the "/" shortcut, the filters behind their
 * button, the views, the workspace switcher, and the breadcrumb, chips, and
 * meta line around the open artifact.
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

  test("should open the filters from the button beside the search and count the ones that are on", async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole("button", { name: "Filters" }).click();
    const format = page.getByRole("combobox", { name: "Filter by format" });
    await format.click();
    await page.getByRole("option", { name: "json", exact: true }).click();
    await expect(format).toContainText("json");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Filters, 1 on" })).toBeVisible();
    await expect(slot(page, "artifact-list").getByRole("heading", { name: "Long json fixture", exact: true })).toBeVisible();
    await expect(slot(page, "artifact-list").getByRole("heading", { name: "Long csv fixture", exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("menuitem", { name: "Manage teams" })).toBeVisible();
  await page.getByRole("menuitem", { name: /Your artifacts/ }).click();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
  await expect(page.getByRole("button", { name: "Workspace: Your artifacts. Switch workspace" })).toContainText("Personal workspace");
});

