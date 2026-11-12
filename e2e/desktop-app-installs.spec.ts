import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The "Add to" buttons for the desktop apps, on the component gallery (no
 * database). Cursor and Claude Desktop are links to the app's own install
 * link; Codex and Grok Bot open their steps in a dialog, with the command
 * and the message ready to copy.
 */

const endpoint = "https://artifacts.space/api/mcp";

const row = (page: Page) => page.locator('[data-specimen="add to a desktop app"]').getByRole("list", { name: "Add to a desktop app" });

async function openGallery(page: Page) {
  await page.goto("/dev/components");
  await expect(row(page)).toBeVisible();
  await row(page).scrollIntoViewIfNeeded();
}

/** The dialog stays inside the window, with room around it. */
async function expectInsideWindow(page: Page, dialog: Locator) {
  const box = await dialog.boundingBox();
  const size = page.viewportSize();
  if (!box || !size) throw new Error("the dialog or the window has no size");
  expect(box.x, "left edge").toBeGreaterThanOrEqual(0);
  expect(box.y, "top edge").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "right edge").toBeLessThanOrEqual(size.width);
  expect(box.y + box.height, "bottom edge").toBeLessThanOrEqual(size.height);
}

test("should show the four apps in order, each with its mark, when the row renders", async ({ page }) => {
  await openGallery(page);
  const items = row(page).getByRole("listitem");
  await expect(items).toHaveText(["Add to Cursor", "Add to Claude Desktop (opens in a new tab)", "Add to Codex", "Add to Grok Bot"]);
  for (const item of await items.all()) {
    await expect(item.locator("svg[data-client-logo]")).toHaveCount(1);
    await expect(item.locator("svg[data-client-logo]")).toBeVisible();
  }
  // Every button is one height, so the row reads as one set of controls.
  const heights = await items.evaluateAll((elements) => elements.map((element) => Math.round((element.firstElementChild ?? element).getBoundingClientRect().height)));
  expect(new Set(heights).size, `button heights ${heights.join(", ")}`).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no sideways page scroll").toBeLessThanOrEqual(0);
});

test("should link Cursor and Claude Desktop to their install links when the app has one", async ({ page }) => {
  await openGallery(page);
  const cursor = row(page).locator("a[data-install=cursor]");
  await expect(cursor).toHaveAttribute("href", /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=artifacts&config=/);

  const claude = row(page).locator("a[data-install=claude-desktop]");
  const href = new URL((await claude.getAttribute("href")) ?? "");
  expect(href.origin + href.pathname).toBe("https://claude.ai/customize/connectors");
  expect(href.searchParams.get("modal")).toBe("add-custom-connector");
  expect(href.searchParams.get("connectorName")).toBe("artifacts.space");
  expect(href.searchParams.get("connectorUrl")).toBe(endpoint);
  await expect(claude).toHaveAttribute("target", "_blank");
  await expect(claude).toHaveAttribute("rel", "noopener noreferrer");
});

test("should open Codex's steps with the command and the settings link when Add to Codex is pressed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openGallery(page);
  const button = row(page).getByRole("button", { name: "Add to Codex" });
  await button.click();

  const dialog = page.getByRole("dialog", { name: "Add to Codex" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-variant="command"]').filter({ hasText: `codex mcp add artifacts --url ${endpoint}` })).toBeVisible();
  await expect(dialog.locator("a", { hasText: "Open Codex settings" })).toHaveAttribute("href", "codex://settings");
  await expect(dialog.getByText("Streamable HTTP")).toBeVisible();
  await expectInsideWindow(page, dialog);

  await dialog.locator('[data-variant="command"]').getByRole("button").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`codex mcp add artifacts --url ${endpoint}`);

  // Close gives the keyboard back to the button that opened the steps.
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});

test("should open Grok Bot's steps with the message for a Bot when Add to Grok Bot is pressed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openGallery(page);
  await row(page).getByRole("button", { name: "Add to Grok Bot" }).click();

  const dialog = page.getByRole("dialog", { name: "Add to Grok Bot" });
  await expect(dialog).toBeVisible();
  for (const label of ["Connect apps", "Add a custom connector", "Remote HTTPS", "Add plugin"]) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(dialog.locator("code").filter({ hasText: endpoint }).first()).toBeVisible();
  await expectInsideWindow(page, dialog);
  // It opens at the first step, and Close stays in reach however far the steps scroll.
  const steps = dialog.locator("[data-slot=install-steps]");
  expect(await steps.evaluate((element) => element.scrollTop), "opens at the first step").toBe(0);
  await steps.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole("button", { name: "Close" })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole("heading", { name: "Add to Grok Bot" })).toBeInViewport({ ratio: 1 });

  const message = dialog.locator("figure[data-code-block]").filter({ hasText: "Add the MCP server at" });
  await message.scrollIntoViewIfNeeded();
  await message.getByRole("button").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`Add the MCP server at ${endpoint} and name it artifacts.`);
});
