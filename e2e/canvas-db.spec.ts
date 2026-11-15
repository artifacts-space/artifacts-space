import type { Locator, Page } from "@playwright/test";

import { artifactsTitled, cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser, versionCount } from "./support/local-db";
import { expect, test } from "./support/test";

/**
 * A canvas stored in a real database: a reader who is not signed in sees its
 * board on the real artifact page, as wide as the title's column; its author
 * sees the same board in the /app pane; and a change typed into its source
 * there is saved by the app and filed as a version that History shows. The
 * fixture checks (canvas.spec.ts) cover the board itself. These need a local
 * throwaway Postgres (E2E_LOCAL_DB=1) and skip without one.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

/** One screen: a heading over a Grid that asks for three columns. */
const screen = (heading: string) => ({
  version: 1,
  root: "page",
  elements: {
    page: { type: "Stack", props: { gap: "lg" }, children: ["title", "grid"] },
    title: { type: "Heading", props: { text: heading, level: 2 } },
    grid: { type: "Grid", props: { columns: 3 }, children: ["one", "two", "three"] },
    one: { type: "Callout", props: { text: "One" } },
    two: { type: "Callout", props: { text: "Two" } },
    three: { type: "Callout", props: { text: "Three" } },
  },
});

/** A canvas of the same screen at two sizes, as an agent would save it. */
const canvasOf = (heading: string) => JSON.stringify({
  version: 1,
  frames: [
    { id: "home-desktop", name: "Home, desktop", width: 1440, spec: screen(heading) },
    { id: "home-phone", name: "Home, phone", width: 390, spec: screen(heading) },
  ],
}, null, 2);

const board = (scope: Page | Locator) => scope.locator("[data-canvas-board]:visible");
const frame = (scope: Page | Locator, id: string) => board(scope).locator(`[data-canvas-frame="${id}"]`);

/** An element's left and right edges inside its side padding. */
const edges = (box: Locator) => box.first().evaluate((element) => {
  const { left, right } = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return { left: left + Number.parseFloat(style.paddingLeft), right: right - Number.parseFloat(style.paddingRight) };
});

/** How many columns the Grid in a frame lays out. */
const gridColumns = (scope: Page | Locator, id: string) => frame(scope, id).locator("[data-slot=ui-grid]").evaluate((element) => {
  const tracks = getComputedStyle(element).gridTemplateColumns;
  return tracks === "none" ? 0 : tracks.split(" ").length;
});

/** Both frames are drawn at their own widths, each with its heading, and each Grid follows its frame. */
async function expectFramesDrawn(scope: Page | Locator, heading: string, mode: "board" | "stacked") {
  await expect(board(scope)).toHaveAttribute("data-canvas-board", mode);
  await expect(board(scope).locator("[data-canvas-frame]")).toHaveCount(2);
  for (const [id, width, columns] of [["home-desktop", 1440, 3], ["home-phone", 390, 1]] as const) {
    await expect(frame(scope, id).getByRole("heading", { name: heading })).toBeVisible();
    expect(await frame(scope, id).locator("[data-canvas-frame-body]").evaluate((element: HTMLElement) => element.offsetWidth)).toBe(width);
    expect(await gridColumns(scope, id)).toBe(columns);
  }
}

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

async function seedCanvas(userId: string, title: string, heading: string, visibility: "private" | "public") {
  const publicId = await createTestArtifact({ userId, title, content: canvasOf(heading), visibility, theme: null, kind: "canvas" });
  created.push(publicId);
  return publicId;
}

test("should show a reader who is not signed in the board, as wide as the title's column, on the real artifact page", async ({ page, isMobile }, testInfo) => {
  const title = `Canvas for a reader ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await seedCanvas(await signIn(page), title, "Welcome back", "public");
  await page.context().clearCookies();

  await page.goto(`/artifact/${publicId}`);
  const heading = page.locator("main h1");
  await expect(heading).toHaveText(title);
  await expect(page.getByRole("textbox", { name: "Artifact title" }), "a reader gets no editor").toHaveCount(0);
  await expectFramesDrawn(page, "Welcome back", isMobile ? "stacked" : "board");

  const column = await edges(heading);
  const shown = await edges(board(page));
  expect(Math.abs(shown.left - column.left), "the board starts where the title starts").toBeLessThanOrEqual(0.5);
  expect(Math.abs(shown.right - column.right), "the board ends where the title ends").toBeLessThanOrEqual(0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "the page does not scroll sideways").toBeLessThanOrEqual(0);
});

test("should open the canvas in the /app pane, save a change typed into its source, and show that version in History", async ({ page, isMobile }, testInfo) => {
  const title = `Canvas in the app ${testInfo.project.name} ${String(Date.now())}`;
  const userId = await signIn(page);
  const publicId = await seedCanvas(userId, title, "Welcome back", "private");

  await page.goto(`/app?artifact=${publicId}`);
  const editor = page.getByRole("region", { name: `Edit ${title}` });
  await expect(editor.getByRole("textbox", { name: "Artifact title" })).toHaveValue(title);
  await expectFramesDrawn(editor, "Welcome back", isMobile ? "stacked" : "board");
  expect(await versionCount(publicId)).toBe(0);

  // The app's own save: the person changes the source, and the editor saves it.
  await editor.getByRole("button", { name: "Edit source" }).click();
  const source = editor.getByRole("textbox", { name: "Artifact source" });
  await expect(source).toHaveValue(/"id": "home-desktop"/);
  await source.fill(canvasOf("Good morning"));
  await expect(editor.getByRole("status").filter({ hasText: "Valid Canvas." })).toBeVisible();
  await expect.poll(async () => (await artifactsTitled(userId, title))[0]?.content, { timeout: 15_000 }).toBe(canvasOf("Good morning"));
  const [saved] = await artifactsTitled(userId, title);
  expect(saved).toMatchObject({ publicId, kind: "canvas" });
  expect(saved?.versions, "the save filed a version").toBeGreaterThanOrEqual(1);

  // History lists that version and draws it as a board.
  await editor.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: `History of ${title}` });
  const versions = history.getByRole("list", { name: "Versions" }).getByRole("button");
  await expect(versions).toHaveCount(saved?.versions ?? 0);
  await versions.first().click();
  await expect(frame(history, "home-desktop").getByRole("heading", { name: "Good morning" })).toBeVisible();
  await expect(frame(history, "home-phone").getByRole("heading", { name: "Good morning" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The saved canvas is what the artifact's own page draws.
  await page.goto(`/artifact/${publicId}`);
  await expect(frame(page, "home-desktop").getByRole("heading", { name: "Good morning" })).toBeVisible();
});
