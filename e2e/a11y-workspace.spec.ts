import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { expectNoAxeViolations } from "./support/a11y";

/*
 * Accessibility of the /app workspace, on /dev/workspace (the real
 * workspace without a database): axe on the whole page and on the sidebar,
 * with the workspace switcher open, and the trees of the switcher's menu and
 * the sidebar's resize handle.
 */

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace" });

/** Found by these checks and left for a separate change (listed in the pull request that added them). */
const knownInWorkspacePage = {
  "aria-allowed-role": {
    on: "h1[role=textbox], h2[role=textbox], h3[role=textbox]",
    reason: "interface title blocks are headings with role=textbox (ui-editor/editable-text.tsx); the fix wraps the textbox in its heading, a change to the block editor",
  },
  "landmark-unique": {
    on: "figure > [role=region]",
    reason: "an interface table's region is named by its caption, and the fixture's long interface repeats the caption Owners",
  },
};

async function openWorkspace(page: Page) {
  await page.goto("/dev/workspace");
  await expect(page.getByRole("region", { name: "Content" })).toBeVisible();
  await expect(page.getByText("Checkout v2 rollout").first()).toBeVisible();
}

test("should pass axe on the workspace page", async ({ page }) => {
  await openWorkspace(page);
  await expectNoAxeViolations(page, { skip: knownInWorkspacePage });
});

test("should pass axe on the sidebar", async ({ page }) => {
  await openWorkspace(page);
  await expectNoAxeViolations(sidebar(page));
});

test("should pass axe with the workspace switcher open", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: /^Workspace: / }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expectNoAxeViolations(page.getByRole("menu"));
});

test("should name the workspace switcher with its visible text and give its menu a tree", async ({ page }) => {
  await openWorkspace(page);
  const switcher = page.getByRole("button", { name: "Workspace: Your artifacts, Personal workspace. Switch workspace" });
  await switcher.click();
  await expect(page.getByRole("menu")).toMatchAriaSnapshot(`
    - 'menu "Workspace: Your artifacts, Personal workspace. Switch workspace"':
      - group "Workspaces":
        - menuitem "Your artifacts Current workspace":
          - text: ""
          - img "Current workspace"
      - separator
      - menuitem "Manage teams"
      - menuitem "Create a team"
  `);
});

test("should give the sidebar's resize handle a separator tree with its value, and change the value from the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones stack the sidebar over the artifact and have no handle.");
  await openWorkspace(page);
  const handle = page.getByRole("separator", { name: "Resize the sidebar" });
  await expect(handle).toHaveAttribute("data-measured", "");
  await expect(handle).toMatchAriaSnapshot(`
    - separator "Resize the sidebar"
  `);
  await expect(handle).toHaveAttribute("aria-orientation", "vertical");
  await expect(handle).toHaveAttribute("aria-controls", "workspace-sidebar");
  await expect(handle).toHaveAttribute("aria-valuetext", /^\d+ pixels$/);
  const before = Number(await handle.getAttribute("aria-valuenow"));
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  await expectNoAxeViolations(handle);
});
