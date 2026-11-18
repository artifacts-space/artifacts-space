import type { Locator, Page } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

import { cleanUp, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser, type TestArtifactKind } from "./support/local-db";
import { closeRestoreDb, seedTwoVersions, storedArtifactText, type SeededText } from "./support/restore-db";

/**
 * Restoring an older version from History shows it at once, with no reload:
 * its title and its body, in the /app editor, on the artifact page while
 * editing, and on the artifact page before its editable copy has loaded.
 * Every format the /app editor draws is covered there, since each draws its
 * body with a different view. Needs dev sign-in and a local throwaway
 * database (support/local-db.ts); skipped otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

const created: string[] = [];

test.afterAll(async () => {
  await closeRestoreDb();
  await cleanUp(created, []);
});

/** Words only the older version holds, and words only the newer one holds. */
const olderMark = "ambervx";
const newerMark = "cobaltvx";

/** Each format's body, holding one of the marks. */
const bodies: Record<TestArtifactKind, ((mark: string) => string) | null> = {
  markdown: (mark) => `# Notes\n\nThe plan says ${mark} today.`,
  text: (mark) => `The plan says ${mark} today.`,
  svg: (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>${mark}</title><rect width="10" height="10" /></svg>`,
  ui: (mark) => JSON.stringify({ version: 1, root: "page", elements: { page: { type: "Stack", props: {}, children: ["title"] }, title: { type: "Heading", props: { text: mark, level: 1 } } } }),
  json: (mark) => JSON.stringify({ note: mark }),
  code: (mark) => `const note = "${mark}";`,
  csv: (mark) => `name,note\nfirst,${mark}`,
  mermaid: (mark) => `flowchart TD\n  A[${mark}] --> B[done]`,
  // A web page runs in a sandboxed frame; shown() reads the frames on the page too.
  html: (mark) => `<!doctype html>\n<html><body><p>${mark}</p></body></html>`,
  // A canvas is a board of frames with no one body text to read; the format gets no new work.
  canvas: null,
};

/**
 * The formats the /app editor and the artifact page draw, each with its own
 * view or editor (the page edits documents and interfaces in place and shows
 * every other format as its read view).
 */
const shownKinds = ["markdown", "text", "svg", "ui", "json", "code", "csv", "mermaid", "html"] as const;

function versionsOf(kind: TestArtifactKind, name: string): { older: SeededText; newer: SeededText } {
  const body = bodies[kind];
  if (!body) throw new Error(`No body for ${kind}.`);
  return { older: { title: `${name} older`, content: body(olderMark) }, newer: { title: `${name} newer`, content: body(newerMark) } };
}

async function signIn(page: Page): Promise<string> {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

async function seed(page: Page, kind: TestArtifactKind, name: string) {
  const userId = await signIn(page);
  const versions = versionsOf(kind, name);
  const publicId = await seedTwoVersions({ userId, kind, ...versions });
  created.push(publicId);
  return { publicId, ...versions };
}

/**
 * Everything a body shows, whatever draws it: its text (an interface's or a
 * diagram's too), the value of its fields (source, code, plain text), the
 * images it draws (an SVG is an image of a data URI), and the text of the
 * frames on the page (a web page runs in a sandboxed frame on its page host).
 */
async function shown(body: Locator): Promise<string> {
  const own = await body.evaluate((element) => {
    const fields = Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input")).map((field) => field.value);
    const images = Array.from(element.querySelectorAll("img")).map((image) => decodeURIComponent(image.src));
    return [element.textContent, ...fields, ...images].join("\n");
  });
  const page = body.page();
  const framed = await Promise.all(
    page
      .frames()
      .filter((frame) => frame !== page.mainFrame())
      .map((frame) => frame.evaluate(() => document.body.innerText).catch(() => "")),
  );
  return [own, ...framed].join("\n");
}

/** Waits until the body shows `mark` and not the other version's. */
async function expectBodyShows(body: Locator, mark: string, other: string) {
  await expect
    .poll(async () => {
      const text = await shown(body);
      return text.includes(mark) && !text.includes(other);
    }, { message: `the body shows ${mark} and not ${other}` })
    .toBe(true);
}

const keptMark = "kept";

/** Leaves a mark on the page's window, which only a reload or a new page load can remove. */
async function markPageLoad(page: Page) {
  await page.evaluate((value) => Reflect.set(window, "restoreTestMark", value), keptMark);
}

/** Fails when the page loaded again since `markPageLoad`: the restore must show without a reload. */
async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => Reflect.get(window, "restoreTestMark") as unknown)).toBe(keptMark);
}

/** Restores the older of the two versions from an open History dialog, and closes it once the restore is done. */
async function restoreOlder(page: Page) {
  const versions = page.getByRole("list", { name: "Versions" }).getByRole("button");
  await expect(versions).toHaveCount(2);
  await versions.last().click();
  await page.getByRole("dialog", { name: /^History of / }).getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("dialog", { name: "Restore this version?" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Restored.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /^History of / })).toHaveCount(0);
}

async function openPageHistory(page: Page) {
  await page.getByRole("banner").getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "History" }).click();
}

for (const kind of shownKinds) {
  test(`should show the restored version of a ${kind} artifact in the /app editor without a reload`, async ({ page }, testInfo) => {
    const { publicId, older, newer } = await seed(page, kind, `Pane restore ${kind} ${testInfo.project.name}`);
    await page.goto(`/app?artifact=${publicId}`);
    const title = page.getByRole("textbox", { name: "Artifact title" });
    const body = page.locator("[data-slot=detail-body]");
    await expect(title).toHaveValue(newer.title);
    await expectBodyShows(body, newerMark, olderMark);

    await markPageLoad(page);

    await page.getByRole("button", { name: "History", exact: true }).click();
    await restoreOlder(page);

    await expect.poll(async () => (await storedArtifactText(publicId)).content).toBe(older.content);
    await expect(title).toHaveValue(older.title);
    await expectBodyShows(body, olderMark, newerMark);
    await expectNoReload(page);
  });
}

for (const kind of shownKinds) {
  test(`should show the restored version of a ${kind} artifact on its page while editing, without a reload`, async ({ page }, testInfo) => {
    const { publicId, older, newer } = await seed(page, kind, `Page restore ${kind} ${testInfo.project.name}`);
    await page.goto(`/artifact/${publicId}`);
    const title = page.getByRole("textbox", { name: "Title" });
    const body = page.locator("article");
    await expect(title).toHaveValue(newer.title);
    await expectBodyShows(body, newerMark, olderMark);

    await markPageLoad(page);

    await openPageHistory(page);
    await restoreOlder(page);

    await expect.poll(async () => (await storedArtifactText(publicId)).content).toBe(older.content);
    await expect(title).toHaveValue(older.title);
    await expectBodyShows(body, olderMark, newerMark);
    await expectNoReload(page);
  });
}

/**
 * Opens the artifact page with its editable copy failing to load, so the page
 * keeps its read view and the header's History is built from the server's
 * data (useWaitingChrome). Every server action that names only the artifact
 * fails until the header says so (in development the copy is asked for
 * twice); then the route lets History's own requests through. Server actions
 * run one at a time, so a copy held back would hold History back too.
 */
async function openWithEditableCopyFailing(page: Page, publicId: string) {
  allowPageError(/Failed to fetch|net::ERR_FAILED/, "The test aborts the editable copy's request, so the page keeps its read view.");
  let failing = true;
  await page.route(`**/artifact/${publicId}`, async (route) => {
    const request = route.request();
    if (failing && request.method() === "POST" && request.postData() === JSON.stringify([publicId])) {
      await route.abort();
      return;
    }
    await route.fallback();
  });
  await page.goto(`/artifact/${publicId}`);
  // The header says the copy could not load (on phones as a warning icon alone).
  await expect(page.getByRole("banner").locator("[data-slot=save-indicator]")).toHaveAttribute("data-tone", "problem");
  failing = false;
}

for (const kind of ["markdown", "svg"] as const) {
  test(`should show the restored version of a ${kind} artifact on its page when editing could not load, without a reload`, async ({ page }, testInfo) => {
    const { publicId, older, newer } = await seed(page, kind, `Waiting restore ${kind} ${testInfo.project.name}`);
    await openWithEditableCopyFailing(page, publicId);
    const heading = page.locator("main h1").first();
    const body = page.locator("article");
    await expect(heading).toHaveText(newer.title);
    await expectBodyShows(body, newerMark, olderMark);
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);

    await markPageLoad(page);

    await openPageHistory(page);
    await restoreOlder(page);

    await expect.poll(async () => (await storedArtifactText(publicId)).content).toBe(older.content);
    await expect(heading).toHaveText(older.title);
    await expectBodyShows(body, olderMark, newerMark);
    await expectNoReload(page);
  });
}
