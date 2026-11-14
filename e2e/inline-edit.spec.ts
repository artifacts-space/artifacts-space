import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

import { closeInlineEditDb, saveAsAgent, saveAsSomeoneElse, storedText, versionKinds, versionSources } from "./support/inline-edit-db";
import { cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";

/** Autosave sends at most one save every 5 seconds (autosave-rules.ts), so "Saved" can take a little over that. */
const savedWithin = { timeout: 12_000 };

/**
 * Inline editing in /app and on the artifact page: an artifact you may edit is unlocked where it
 * reads, saves on its own a moment after typing stops, files one version per
 * editing session, and never overwrites someone else's newer save. Needs dev
 * sign-in and a local throwaway database (support/local-db.ts); skipped
 * otherwise.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);
test.describe.configure({ mode: "serial" });

const created: string[] = [];

test.afterAll(async () => {
  await closeInlineEditDb();
  await cleanUp(created, []);
});

const saveStatus = (page: Page) => page.locator("[data-slot=save-status]").getByRole("status");
/** On the artifact's own page, the save status sits in the page header beside its More menu. */
const pageSaveStatus = (page: Page) => page.getByRole("banner").locator("[data-slot=save-indicator]");

/** Signs in, seeds a Markdown artifact, and opens it in /app. Returns its public id. */
async function openSeeded(page: Page, title: string, content: string) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content, visibility: "private", theme: null });
  created.push(publicId);
  await openInApp(page, title);
  return publicId;
}

async function openInApp(page: Page, title: string) {
  await page.goto("/app");
  await page.locator("[data-slot=artifact-list]").getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue(title);
}

/** Types at the end of a line of the document. */
async function typeAfter(page: Page, line: string, text: string) {
  await page.getByRole("textbox", { name: "Artifact content" }).getByText(line).click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test("should save a Markdown edit in place, keep it after a reload, and file one version for the session", async ({ page }, testInfo) => {
  const title = `Inline markdown ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Launch notes\n\nFirst line.");
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Editor mode" })).toHaveCount(0);

  await typeAfter(page, "First line.", " Second burst.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  await typeAfter(page, "Second burst.", " Third burst.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);

  await page.reload();
  await openInApp(page, title);
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("First line. Second burst. Third burst.");
  // The artifact as it was seeded, then one version for the whole editing session.
  expect(await versionKinds(publicId)).toEqual(["snapshot", "edit"]);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
});

test("should merge someone else's newer save when it changed a different field", async ({ page }, testInfo) => {
  const title = `Inline merge ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Notes\n\nMine starts here.");
  await typeAfter(page, "Mine starts here.", " One.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);

  await saveAsSomeoneElse(publicId, { title: `${title} (renamed)` });
  await typeAfter(page, "One.", " Two.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);
  await expect(page.getByRole("textbox", { name: "Artifact title" })).toHaveValue(`${title} (renamed)`);
  expect(await storedText(publicId)).toEqual({ title: `${title} (renamed)`, content: "# Notes\n\nMine starts here. One. Two." });
});

test("should refuse to overwrite someone else's newer content and offer their version", async ({ page }, testInfo) => {
  const title = `Inline conflict ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Notes\n\nShared line.");
  await typeAfter(page, "Shared line.", " Mine.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);

  await saveAsSomeoneElse(publicId, { content: "# Notes\n\nTheirs instead." });
  await typeAfter(page, "Mine.", " Still mine.");
  await expect(page.getByText(/saved a newer version while you were editing/)).toBeVisible();
  expect((await storedText(publicId)).content, "their save is untouched").toBe("# Notes\n\nTheirs instead.");

  await page.getByRole("button", { name: "Load their version" }).click();
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("Theirs instead.");
  await expect(page.getByText(/saved a newer version while you were editing/)).toHaveCount(0);
});

test("should save the person's typing over an agent's newer save, say so, and keep the agent's version in History", async ({ page }, testInfo) => {
  const title = `Inline agent ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Answers\n\nQ1:");
  await typeAfter(page, "Q1:", " first.");
  await expect(saveStatus(page)).toHaveText("Saved", savedWithin);

  await saveAsAgent(publicId, "# Answers\n\nQ1: the agent's rewrite.");
  await typeAfter(page, "first.", " Still mine.");
  await expect(page.locator("[data-slot=agent-save-notice]")).toContainText("An agent saved changes while you were editing. Your version is saved; theirs is in History.", savedWithin);
  // What the person typed stays in the editor and is what is saved.
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("Q1: first. Still mine.");
  expect((await storedText(publicId)).content).toBe("# Answers\n\nQ1: first. Still mine.");
  const sources = await versionSources(publicId);
  expect(sources.map((version) => version.harness)).toEqual([null, null, "claude-code", null]);
  expect(sources[2]?.content, "the agent's version stays in History").toBe("# Answers\n\nQ1: the agent's rewrite.");

  await page.locator("[data-slot=agent-save-notice]").getByRole("button", { name: "Open History" }).click();
  await expect(page.getByRole("dialog", { name: /^History of / }).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(4);
});

test("should unlock Markdown in place on the artifact's own page and save it on its own", async ({ page }, testInfo) => {
  const title = `Inline page ${testInfo.project.name} ${String(Date.now())}`;
  const publicId = await openSeeded(page, title, "# Page notes\n\nRead here.");
  await page.goto(`/artifact/${publicId}`);
  const content = page.getByRole("textbox", { name: "Artifact content" });
  await expect(content).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  const status = pageSaveStatus(page);

  await content.getByText("Read here.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited here.");
  await expect(status).toHaveText("Saved", savedWithin);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Artifact content" })).toContainText("Read here. Edited here.");
  expect(await versionKinds(publicId)).toEqual(["snapshot", "edit"]);
});

test("should save a heading typed into an interface, keep it after a reload, and file one version", async ({ page }, testInfo) => {
  const title = `Inline interface ${testInfo.project.name} ${String(Date.now())}`;
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const spec = { version: 1, root: "page", elements: { page: { type: "Stack", props: {}, children: ["title"] }, title: { type: "Heading", props: { text: "Launch plan", level: 1 } } } };
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content: JSON.stringify(spec), visibility: "private", theme: null, kind: "ui" });
  created.push(publicId);
  await page.goto(`/artifact/${publicId}`);
  const heading = page.locator("[data-slot=ui-block-editor]").getByRole("textbox", { name: "Heading" });
  await heading.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" for Friday");
  await page.keyboard.type(" and Monday");
  await expect(pageSaveStatus(page)).toHaveText("Saved", savedWithin);

  await page.reload();
  await expect(page.locator("[data-slot=ui-block-editor]").getByRole("textbox", { name: "Heading" })).toHaveText("Launch plan for Friday and Monday");
  expect(await versionKinds(publicId)).toEqual(["snapshot", "edit"]);
  await page.getByRole("banner").getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "History" }).click();
  await expect(page.getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
});

/**
 * Opens the artifact page with its server actions (the editable copy among
 * them) held back. Resolves once the page has hydrated and asked for its
 * copy, so clicks land; the returned function lets the copy load.
 */
async function openWithEditableCopyHeld(page: Page, publicId: string): Promise<() => void> {
  await page.unrouteAll({ behavior: "wait" });
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/artifact/${publicId}`, async (route) => {
    if (route.request().method() === "POST") await held;
    await route.fallback();
  });
  const loading = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith(`/artifact/${publicId}`));
  await page.goto(`/artifact/${publicId}`);
  await loading;
  return release;
}

/** The pickers in the artifact's heading: how to open each, and something inside it while it is open. */
const headingPickers = [
  {
    name: "theme",
    open: (page: Page) => page.getByRole("button", { name: "Choose a theme" }).click(),
    inside: (page: Page) => page.getByRole("listbox", { name: "Artifact theme" }),
  },
  {
    name: "icon",
    open: (page: Page) => page.getByRole("button", { name: "Add icon" }).click(),
    inside: (page: Page) => page.getByRole("tab", { name: "Upload" }),
  },
  {
    name: "cover",
    open: async (page: Page) => {
      await page.locator("[data-artifact-cover]").hover();
      await page.getByRole("button", { name: "Change cover" }).click();
    },
    inside: (page: Page) => page.getByRole("option", { name: "Dusk" }),
  },
] as const;

test("should keep the theme, icon, and cover pickers open on the artifact page when editing unlocks", async ({ page }, testInfo) => {
  const title = `Inline unlock ${testInfo.project.name} ${String(Date.now())}`;
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  const publicId = await createTestArtifact({ userId: await readyDevUser(), title, content: "# Notes\n\nOpen a picker first.", visibility: "private", theme: null, cover: "mist" });
  created.push(publicId);
  const content = page.getByRole("textbox", { name: "Artifact content" });

  for (const picker of headingPickers) {
    const release = await openWithEditableCopyHeld(page, publicId);
    await picker.open(page);
    await expect(picker.inside(page), `${picker.name} picker opens`).toBeVisible();
    await expect(content).toHaveCount(0);

    release();
    await expect(content).toBeVisible();
    // The heading and its pickers keep their place when the read view turns editable.
    await expect(picker.inside(page), `${picker.name} picker stays open`).toBeVisible();
    await page.keyboard.press("Escape");
  }

  // The picker still works after the switch.
  const release = await openWithEditableCopyHeld(page, publicId);
  await page.getByRole("button", { name: "Choose a theme" }).click();
  release();
  await expect(content).toBeVisible();
  await page.getByRole("listbox", { name: "Artifact theme" }).getByRole("option", { name: "Paper Work Sans" }).click();
  await expect(page.getByRole("button", { name: "Theme: Paper. Change theme" })).toBeVisible();
});
