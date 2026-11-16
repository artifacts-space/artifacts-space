import type { Page, Request } from "@playwright/test";
import { allowPageError, expect, test } from "./support/test";

/**
 * The workspace's address bar names the open artifact
 * (`?artifact=<publicId>`): each pick is a history entry, Back and Forward
 * walk the artifacts opened, a reload opens the same one, and a link's
 * comment params act once. Checked on /dev/workspace, the real workspace
 * without a database, on a phone and a desktop.
 */

const list = (page: Page) => page.locator('[data-slot="artifact-list"]');
/** A card's button, by its title alone: "Note 2" never matches "Note 20". */
const card = (page: Page, title: string) => list(page).getByRole("button", { name: new RegExp(`^${title}(?!\\d)`) });
const selectedCard = (page: Page) => list(page).locator('[aria-current="true"]');
const editor = (page: Page, title: string) => page.getByRole("region", { name: `Edit ${title}` });
const historyLength = (page: Page) => page.evaluate(() => window.history.length);
const linksHandled = (page: Page) => page.evaluate(() => window.fixture?.linksHandled() ?? -1);
const refreshPage = (page: Page) => page.evaluate(() => { window.fixture?.refresh(); });

/** A request for this page itself (a document load, a navigation, a refresh), not a prefetch of a link. */
function isPageRequest(request: Request): boolean {
  const headers = request.headers();
  return new URL(request.url()).pathname === "/dev/workspace" && headers["next-router-prefetch"] === undefined;
}

/** Records every request for the page from now on. */
function recordPageRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => { if (isPageRequest(request)) seen.push(`${request.method()} ${request.url()}`); });
  return seen;
}

/** Picks an artifact in the list once the workspace is interactive: the server-rendered list does nothing until it hydrates. */
async function pick(page: Page, title: string) {
  await expect(async () => {
    await card(page, title).click();
    await expect(selectedCard(page)).toContainText(title, { timeout: 1000 });
  }).toPass();
}

/** The second card in the list, whatever it is: a pick that is not the artifact opened by default. */
async function pickSecond(page: Page): Promise<void> {
  const second = list(page).locator("li").nth(1).getByRole("button").first();
  await expect(async () => {
    await second.click();
    await expect(second).toHaveAttribute("aria-current", "true", { timeout: 1000 });
  }).toPass();
}

test("should name each picked artifact in the URL without asking the server, and walk them with Back and Forward", async ({ page }) => {
  await page.goto("/dev/workspace");
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await expect(page, "opening the workspace keeps plain /app").toHaveURL(/\/dev\/workspace$/);
  const start = await historyLength(page);
  const requests = recordPageRequests(page);

  await pick(page, "Long markdown fixture");
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspace000md$/);
  await expect(editor(page, "Long markdown fixture")).toBeVisible();
  await pick(page, "Note 2");
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspacenote01$/);
  await expect(editor(page, "Note 2")).toBeVisible();
  expect(await historyLength(page), "each pick is one history entry").toBe(start + 2);

  await page.goBack();
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspace000md$/);
  await expect(editor(page, "Long markdown fixture")).toBeVisible();
  await expect(selectedCard(page)).toContainText("Long markdown fixture");
  await page.goBack();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await page.goForward();
  await expect(editor(page, "Long markdown fixture")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspacenote01$/);
  await expect(editor(page, "Note 2")).toBeVisible();
  expect(await historyLength(page), "Back and Forward add no entry").toBe(start + 2);
  expect(requests, "picks, Back, and Forward ask the server for nothing").toEqual([]);

  await page.reload();
  await expect(editor(page, "Note 2")).toBeVisible();
  await expect(selectedCard(page)).toContainText("Note 2");
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspacenote01$/);
});

test("should open what the address names when Back comes before the pick's entry is drawn", async ({ page }) => {
  await page.goto("/dev/workspace");
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await pick(page, "Long markdown fixture");
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspace000md$/);

  // Back in the same task as the pick's push, so the router draws both in one pass and its search never changes.
  await page.evaluate(() => {
    const push = window.history.pushState.bind(window.history);
    window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      window.history.pushState = push;
      push(data, unused, url);
      queueMicrotask(() => { window.history.back(); });
    };
  });
  await card(page, "Note 2").click();

  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspace000md$/);
  await expect(editor(page, "Long markdown fixture")).toBeVisible();
  await expect(selectedCard(page)).toContainText("Long markdown fixture");
});

for (const query of ["?project=design", "?tag=launch", "?scopes=1&team=fixture-shared-0"]) {
  test(`should keep the list's params when a pick names the artifact (${query})`, async ({ page }) => {
    await page.goto(`/dev/workspace${query}`);
    await expect(list(page).locator("li").nth(1)).toBeVisible();
    await pickSecond(page);
    const escaped = query.replace(/[?]/g, "\\?");
    await expect(page).toHaveURL(new RegExp(`/dev/workspace${escaped}&artifact=[A-Za-z0-9]+$`));
    const named = new URL(page.url()).searchParams.get("artifact");

    await page.reload();
    await expect(list(page).locator("li").nth(1).getByRole("button").first()).toHaveAttribute("aria-current", "true");
    expect(new URL(page.url()).searchParams.get("artifact")).toBe(named);
  });
}

test("should drop a link's comment params once it is acted on, keep the artifact, and not open the comments again", async ({ page }) => {
  await page.goto("/dev/workspace?scopes=1&artifact=fixtureworkspacenote01&comment=0b6f6a52-1c3e-4c1a-9f0e-2d7b8c9a1e2f");
  await expect(page.getByRole("heading", { name: "Comments on Note 2" })).toBeVisible();
  await expect(page).toHaveURL(/\/dev\/workspace\?scopes=1&artifact=fixtureworkspacenote01$/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Comments on Note 2" })).toHaveCount(0);
  expect(await linksHandled(page)).toBe(1);

  // A save's refresh asks the server for the router's own URL: it must name the artifact and nothing more.
  const refreshed = page.waitForResponse((response) => isPageRequest(response.request()) && response.request().headers().rsc === "1");
  await refreshPage(page);
  const refreshedUrl = new URL((await refreshed).url());
  expect(refreshedUrl.searchParams.get("artifact")).toBe("fixtureworkspacenote01");
  expect(refreshedUrl.searchParams.has("comment")).toBe(false);
  await expect(page).toHaveURL(/\/dev\/workspace\?scopes=1&artifact=fixtureworkspacenote01$/);
  await expect(page.getByRole("heading", { name: "Comments on Note 2" })).toHaveCount(0);
  expect(await linksHandled(page)).toBe(1);

  await page.reload();
  await expect(editor(page, "Note 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments on Note 2" })).toHaveCount(0);
});

test("should load an artifact outside the list when Back names it after a reload", async ({ page }) => {
  await page.goto("/dev/workspace");
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("dialog").getByRole("link").filter({ hasText: "approved sharing Shared by link fixture" }).click();
  await expect(editor(page, "Shared by link fixture")).toBeVisible();
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspacelinked$/);
  await pick(page, "Long ui fixture");
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspace0000ui$/);

  // After the reload the list no longer holds it: Back loads it through the access check and pins it again.
  await page.reload();
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await expect(card(page, "Shared by link fixture")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixtureworkspacelinked$/);
  await expect(editor(page, "Shared by link fixture")).toBeVisible();
  await expect(selectedCard(page)).toContainText("Shared by link fixture");
  await expect(page.getByText("This artifact is no longer available.")).toHaveCount(0);
});

test("should add no history entry while the person types, and keep the draft across Back and Forward", async ({ page }) => {
  allowPageError("/api/files/", "The /dev/workspace stand-in keeps uploads in the tab, so the file route, which has no database here, cannot serve them.");
  await page.goto("/dev/workspace");
  await expect(list(page).locator("li").first()).toBeVisible();
  await page.evaluate(() => { window.sessionStorage.clear(); });
  await page.reload();
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "New artifact" }).click();
    await expect(page.getByRole("region", { name: "New artifact" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  const body = page.getByRole("region", { name: "Content" });
  await expect(body.locator('[contenteditable="true"]')).toBeVisible();

  await page.keyboard.type("Address draft check");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First line.");
  // Storing the blank page opens a new artifact: one entry, naming it.
  await expect(page).toHaveURL(/\/dev\/workspace\?artifact=fixturenew[A-Za-z0-9]+$/);
  const stored = page.url();
  const entries = await historyLength(page);

  await page.keyboard.type(" More words while the address stays.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(page.url(), "typing never changes the address").toBe(stored);
  expect(await historyLength(page), "typing adds no history entry").toBe(entries);

  // Back right after typing, before autosave's delay: leaving saves what is left, as a pick in the list does.
  await page.keyboard.type(" Typed just before Back.");
  await page.goBack();
  await expect(page).toHaveURL(/\/dev\/workspace$/);
  await expect(editor(page, "Long ui fixture")).toBeVisible();
  await page.goForward();
  expect(page.url()).toBe(stored);
  await expect(editor(page, "Address draft check")).toBeVisible();
  await expect(body).toContainText("More words while the address stays. Typed just before Back.");
});
