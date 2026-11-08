import { expect, test, type Locator, type Page } from "@playwright/test";

import { UI_SPEC_VERSION } from "../src/lib/ui/version";

import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * The page column in /app and on the artifact's page, with a real artifact:
 * the /app preview holds callouts and diagrams to the same column readers
 * see, Full width widens them in both Edit and Preview, and the in-place
 * editor on the artifact's page has the setting too.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.skip(({ isMobile }) => isMobile, "measured on desktop");

const wide = { width: 1600, height: 900 };
/** The public page's column is 960px with 24px of padding each side, so its content runs 912px wide. */
const pageContent = 912;
const created: string[] = [];

const widthOf = (box: Locator) => box.evaluate((element) => element.getBoundingClientRect().width);

/** An interface with a callout and a diagram, the blocks that used to stretch across the /app pane. */
const uiContent = JSON.stringify({
  version: UI_SPEC_VERSION,
  root: "page",
  elements: {
    page: { type: "Stack", props: { gap: "lg" }, children: ["note", "flow"] },
    note: { type: "Callout", props: { tone: "info", title: "Rollout", text: "Every guardrail held." } },
    flow: { type: "Diagram", props: { code: "flowchart LR\n  Plan --> Build --> Ship" } },
  },
});

test.afterAll(async () => {
  await cleanUp(created, []);
});

/** Signs in as the dev user and seeds a private artifact for them. */
async function seed(page: Page, title: string, kind: "markdown" | "ui") {
  await page.setViewportSize(wide);
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const content = kind === "ui" ? uiContent : "# Notes\n\nA short note.";
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content, visibility: "private", theme: null, kind });
  created.push(publicId);
  return publicId;
}

test("should match the public page's column in the /app preview and widen it with Full width from Edit mode", async ({ page }) => {
  const title = "Page column e2e";
  const publicId = await seed(page, title, "ui");

  // What readers see on the artifact's page.
  await page.goto(`/artifact/${publicId}`);
  const readerCallout = page.locator("main article").getByRole("note").first();
  await expect(readerCallout).toBeVisible();
  const pageCallout = await widthOf(readerCallout);
  expect(pageCallout).toBeLessThanOrEqual(pageContent + 1);

  await page.goto("/app");
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name: new RegExp(title) }).click();
  const body = page.locator("[data-slot=detail-body]");
  const callout = body.getByRole("note");
  const diagram = body.locator("figure");
  await expect(callout).toBeVisible();
  expect(Math.abs((await widthOf(callout)) - pageCallout), "the preview matches the page").toBeLessThanOrEqual(1);
  expect(await widthOf(diagram)).toBeLessThanOrEqual(pageContent + 1);
  const open = page.getByRole("link", { name: "Open the artifact page in a new tab" });
  await expect(open).toHaveAttribute("href", `/artifact/${publicId}`);
  await expect(open).toHaveAttribute("target", "_blank");

  await page.getByRole("tab", { name: "edit" }).click();
  const source = page.getByRole("textbox", { name: "Artifact content" });
  expect(await widthOf(source)).toBeLessThanOrEqual(960);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Full width" }).click();
  await expect(body.locator("[data-full-width]")).toHaveAttribute("data-full-width", "true");
  await page.keyboard.press("Escape");
  expect(await widthOf(source), "the source field follows Full width").toBeGreaterThan(1000);

  await page.getByRole("tab", { name: "preview" }).click();
  expect(await widthOf(callout), "callouts widen").toBeGreaterThan(1000);
  expect(await widthOf(diagram), "diagrams widen").toBeGreaterThan(1000);
});

test("should offer Full width in the in-place editor on the artifact's page and widen the page while it stays open", async ({ page }) => {
  const title = "Page editor width e2e";
  const publicId = await seed(page, title, "markdown");
  await page.goto(`/artifact/${publicId}`);
  const main = page.locator("main");
  await expect(main).toHaveAttribute("data-full-width", "false");
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const toggle = page.getByRole("switch", { name: "Full width" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(main).toHaveAttribute("data-full-width", "true");
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("form", { name: `Edit ${title}` }), "the editor stays open").toBeVisible();
  expect(await widthOf(main)).toBeGreaterThan(960);
});
