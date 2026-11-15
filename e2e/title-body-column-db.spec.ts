import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { cleanUp, createTestArtifact, createTestUser, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/**
 * The title and the body in one column where a person only reads: the real
 * artifact page for a reader who is not signed in (the page as the server
 * draws it, with no editor and no fixture around it), and the /app pane for
 * an artifact someone else shared. The fixture checks
 * (title-body-column.spec.ts) cover the editor. These need a local throwaway
 * Postgres (E2E_LOCAL_DB=1) and skip without one.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.skip(({ isMobile }) => isMobile, "window widths are set here");

const created: string[] = [];
const authors: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, authors);
});

const line = "A long line of plain prose that runs well past one line, so the column decides where it ends. ".repeat(8).trim();
/** A summary long enough to wrap, so the column decides where it ends too. */
const summary = "A summary that says who writes this page, who reads it, and what it decides, long enough to wrap in the column at every window width. ".repeat(3).trim();

/** The text's own edges: an element's box inside its side padding. */
const textEdges = (box: Locator) => box.first().evaluate((element) => {
  const { left, right } = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return { left: left + Number.parseFloat(style.paddingLeft), right: right - Number.parseFloat(style.paddingRight) };
});

/** An interface of one three-column grid: its edges and its columns show the width the interface was given. */
const gridInterface = JSON.stringify({
  version: 1,
  root: "grid",
  elements: {
    grid: { type: "Grid", props: { columns: 3 }, children: ["one", "two", "three"] },
    one: { type: "Callout", props: { text: "One" } },
    two: { type: "Callout", props: { text: "Two" } },
    three: { type: "Callout", props: { text: "Three" } },
  },
});

/**
 * The grid fills the column the title sits in, and lays out the columns that
 * width allows (three from 608px, as in layout.tsx). An interface has no
 * width of its own, so a parent that sized it by its content would collapse
 * it here.
 */
async function expectGridInColumn(grid: Locator, heading: Locator) {
  const title = await textEdges(heading);
  const edges = await textEdges(grid);
  expect(Math.abs(edges.left - title.left), "the interface starts where the title starts").toBeLessThanOrEqual(0.5);
  expect(Math.abs(edges.right - title.right), "the interface ends where the title ends").toBeLessThanOrEqual(0.5);
  expect(edges.right - edges.left, "the column is wide enough for three columns").toBeGreaterThanOrEqual(608);
  const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(3);
}

/** Signs in to seed a public artifact, then signs out, so the page is a reader's. */
async function openAsReader(page: Page, input: { title: string; content: string; kind: "markdown" | "text" | "ui" }) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title: input.title, content: input.content, visibility: "public", theme: null, kind: input.kind, summary });
  created.push(publicId);
  await page.context().clearCookies();
  await page.goto(`/artifact/${publicId}`);
  await expect(page.locator("main h1")).toHaveText(input.title);
}

/** The reader's summary, on the real page, ends where the title ends: it has no narrower width of its own. */
async function expectSummaryInColumn(page: Page) {
  const title = await textEdges(page.locator("main h1"));
  const edges = await textEdges(page.locator("main p").filter({ hasText: summary.slice(0, 40) }));
  expect(Math.abs(edges.left - title.left), "the summary starts where the title starts").toBeLessThanOrEqual(0.5);
  expect(Math.abs(edges.right - title.right), "the summary ends where the title ends").toBeLessThanOrEqual(0.5);
}

for (const size of [{ width: 1720, height: 900 }, { width: 1280, height: 800 }, { width: 960, height: 800 }]) {
  test(`should end a Markdown body's text where the title ends for a reader, at ${String(size.width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await openAsReader(page, { title: `One column markdown ${testInfo.project.name} ${String(size.width)}`, content: `## Notes\n\n${line}`, kind: "markdown" });
    const title = await textEdges(page.locator("main h1"));
    for (const part of [page.locator("main .artifact-prose > h2"), page.locator("main .artifact-prose > p")]) {
      const edges = await textEdges(part);
      expect(Math.abs(edges.left - title.left), "the body starts where the title starts").toBeLessThanOrEqual(0.5);
      expect(Math.abs(edges.right - title.right), "the body ends where the title ends").toBeLessThanOrEqual(0.5);
    }
    await expectSummaryInColumn(page);
  });

  test(`should end a plain text body where the title ends for a reader, at ${String(size.width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await openAsReader(page, { title: `One column text ${testInfo.project.name} ${String(size.width)}`, content: line, kind: "text" });
    const title = await textEdges(page.locator("main h1"));
    const edges = await textEdges(page.locator("main article").filter({ hasText: line.slice(0, 40) }).last());
    expect(Math.abs(edges.left - title.left), "the text starts where the title starts").toBeLessThanOrEqual(0.5);
    expect(Math.abs(edges.right - title.right), "the text ends where the title ends").toBeLessThanOrEqual(0.5);
    await expectSummaryInColumn(page);
  });

  test(`should give an interface the whole column for a reader, at ${String(size.width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await openAsReader(page, { title: `One column interface ${testInfo.project.name} ${String(size.width)}`, content: gridInterface, kind: "ui" });
    await expectGridInColumn(page.locator("main [data-slot=ui-grid]"), page.locator("main h1"));
    await expectSummaryInColumn(page);
  });
}

/** Signs in, and opens in /app someone else's public artifact from its link: the pane's read-only view. */
async function openShared(page: Page, input: { title: string; content: string; kind: "markdown" | "text" | "ui" }) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  await readyDevUser();
  const authorId = await createTestUser();
  authors.push(authorId);
  const publicId = await createTestArtifact({ userId: authorId, title: input.title, content: input.content, visibility: "public", theme: null, kind: input.kind });
  created.push(publicId);
  await page.goto(`/app?artifact=${publicId}`);
  const heading = page.locator("[data-slot=detail-outer]").getByRole("heading", { name: input.title });
  await expect(heading).toBeVisible();
  return heading;
}

for (const size of [{ width: 1720, height: 900 }, { width: 1280, height: 800 }]) {
  test(`should end a shared Markdown artifact's text where its title ends in the /app pane, at ${String(size.width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const heading = await openShared(page, { title: `Shared column markdown ${testInfo.project.name} ${String(size.width)}`, content: `## Notes\n\n${line}`, kind: "markdown" });
    const title = await textEdges(heading);
    const edges = await textEdges(page.locator("[data-slot=detail-body] .artifact-prose > p"));
    expect(Math.abs(edges.left - title.left), "the body starts where the title starts").toBeLessThanOrEqual(0.5);
    expect(Math.abs(edges.right - title.right), "the body ends where the title ends").toBeLessThanOrEqual(0.5);
  });

  test(`should end a shared plain text artifact's text where its title ends in the /app pane, at ${String(size.width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const heading = await openShared(page, { title: `Shared column text ${testInfo.project.name} ${String(size.width)}`, content: line, kind: "text" });
    const title = await textEdges(heading);
    const edges = await textEdges(page.locator("[data-slot=detail-body] article").filter({ hasText: line.slice(0, 40) }).last());
    expect(Math.abs(edges.left - title.left), "the text starts where the title starts").toBeLessThanOrEqual(0.5);
    expect(Math.abs(edges.right - title.right), "the text ends where the title ends").toBeLessThanOrEqual(0.5);
  });

  test(`should give a shared interface the whole column in the /app pane, at ${String(size.width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const heading = await openShared(page, { title: `Shared column interface ${testInfo.project.name} ${String(size.width)}`, content: gridInterface, kind: "ui" });
    await expectGridInColumn(page.locator("[data-slot=detail-body] [data-slot=ui-grid]"), heading);
  });
}

test("should start the share notice's words where the title starts in the /app pane, for a public artifact", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const title = `Share notice column ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content: `## Notes\n\n${line}`, visibility: "public", theme: null });
  created.push(publicId);
  await page.goto(`/app?artifact=${publicId}`);
  const field = page.getByRole("textbox", { name: "Artifact title" });
  await expect(field).toHaveValue(title);
  const notice = page.getByText("Anyone can find and read this artifact.");
  await expect(notice).toBeVisible();
  const row = await textEdges(notice.locator(".."));
  const edges = await textEdges(field);
  expect(Math.abs(row.left - edges.left), "the notice's row starts where the title starts").toBeLessThanOrEqual(0.5);
  expect(Math.abs(row.right - edges.right), "the notice's row ends where the title ends").toBeLessThanOrEqual(0.5);
});
