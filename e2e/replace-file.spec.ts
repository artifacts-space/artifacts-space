import type { Page } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

/**
 * Replace in the Files section: a new upload takes a file's place under the
 * same entry, so its name, place, and id stay, and a refused replace leaves
 * the file as it was and discards the upload. Checked on /dev/workspace,
 * whose stand-in stores new artifacts in the tab's sessionStorage and acts
 * as the server does (fixture-new-artifacts.ts).
 */

interface StoredFile { id: string; filename: string; size: number; replacedAt: string | null }
const storedFiles = (page: Page) =>
  page.evaluate(() => (JSON.parse(window.sessionStorage.getItem("fixture:new-artifacts") ?? "[]") as { files: StoredFile[] }[])[0]?.files ?? []);
const discarded = (page: Page) => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("fixture:discarded") ?? "[]") as string[]);
const body = (page: Page) => page.getByRole("region", { name: "Content" });
const filesSection = (page: Page) => page.locator("[data-slot=attached-files]");

async function openNewArtifact(page: Page) {
  allowPageError("/api/files/", "The /dev/workspace stand-in keeps uploads in the tab, so the file route, which has no database here, cannot serve them.");
  await page.goto("/dev/workspace");
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await page.evaluate(() => { window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator("[data-slot=artifact-list] li").first()).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "New artifact" }).click();
    await expect(page.getByRole("region", { name: "New artifact" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(body(page).locator('[contenteditable="true"]')).toBeVisible();
}

/** Drops PDFs on the blank page, which makes a Files artifact with them. */
async function dropFiles(page: Page, names: readonly string[]) {
  await body(page).evaluate((element, files) => {
    const data = new DataTransfer();
    for (const name of files) data.items.add(new File(["%PDF-1.4"], name, { type: "application/pdf" }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, [...names]);
  await expect(filesSection(page)).toContainText(`${String(names.length)} attached`);
}

/** Picks a replacement for one file, as the Replace button's file picker would. */
async function replaceWith(page: Page, filename: string, picked: { name: string; content: string }) {
  const chooser = page.waitForEvent("filechooser");
  await filesSection(page).getByRole("button", { name: `Replace ${filename}` }).click();
  await (await chooser).setFiles({ name: picked.name, mimeType: "application/pdf", buffer: Buffer.from(picked.content) });
}

test("should put a new upload in a file's place and keep its name, place, and id", async ({ page }) => {
  await openNewArtifact(page);
  await dropFiles(page, ["SOW.pdf", "Deck.pdf"]);
  const [before] = await storedFiles(page);
  if (!before) throw new Error("No stored file.");

  await replaceWith(page, "SOW.pdf", { name: "SOW draft 3.pdf", content: "%PDF-1.4 version three, longer" });

  await expect(page.getByText("Replaced SOW.pdf. The old copy is in History.")).toBeVisible();
  const rows = filesSection(page).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("SOW.pdf");
  await expect(rows.nth(1)).toContainText("Deck.pdf");
  await expect.poll(async () => (await storedFiles(page))[0]?.replacedAt).not.toBeNull();
  const [after] = await storedFiles(page);
  expect(after).toMatchObject({ id: before.id, filename: "SOW.pdf" });
  expect(after?.size).toBeGreaterThan(before.size);
  // The open link changes with the replace, so a browser never opens the old file from its cache.
  await expect(rows.first().locator('a[aria-label="Open SOW.pdf"]')).toHaveAttribute("href", /\/api\/files\/[0-9a-f-]+\?v=\d+$/);
});

test("should leave the file as it was and discard the upload when the replace is refused", async ({ page }) => {
  await openNewArtifact(page);
  await dropFiles(page, ["SOW.pdf"]);
  const [before] = await storedFiles(page);
  await page.evaluate(() => { window.sessionStorage.setItem("fixture:next-replace", "refuse"); });

  await replaceWith(page, "SOW.pdf", { name: "Other.pdf", content: "%PDF-1.4 other" });

  await expect(page.getByText("The file changed while it was being replaced, so it was not replaced. Try again.")).toBeVisible();
  await expect.poll(async () => (await discarded(page)).length).toBe(1);
  expect(await storedFiles(page)).toEqual([before]);
  await expect(filesSection(page).getByRole("button", { name: "Replace SOW.pdf" })).toBeEnabled();
});
