import { mintRenderToken } from "../src/lib/page-render/token";
import { pageShownSelector, renderPagePath } from "../src/lib/page-render/rules";

import { artifactRowOf, cleanUp, createTestArtifact, localDatabaseEnabled, localDatabaseSkipReason, readyDevUser } from "./support/local-db";
import { expect, test } from "./support/test";

/**
 * The render page that the hosted browser opens for artifacts_page_image,
 * against a real database: under a render token it shows the artifact's
 * page running in its page frame and marks the frame with the selector the
 * browser waits for; a token for an older save, or a broken one, shows no
 * frame. Needs dev sign-in and a local throwaway database
 * (support/local-db.ts); skipped otherwise. The token's own checks are in
 * src/lib/page-render/*.test.ts.
 */

test.skip(!localDatabaseEnabled(), localDatabaseSkipReason);

// The secret the e2e dev server runs with (playwright.config.ts), so a token made here opens there.
const secret = process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-used-anywhere-else-0123456789";
const page = "<!doctype html><html><body><h1 id=hello>Hello from the page</h1></body></html>";

const created: string[] = [];

test.afterAll(async () => {
  await cleanUp(created, []);
});

test("should show the page running in its frame when the token names its owner and its save", async ({ page: tab }) => {
  await tab.goto("/api/dev/sign-in");
  await tab.waitForURL(/\/app/);
  const ownerId = await readyDevUser();
  const publicId = await createTestArtifact({ userId: ownerId, title: "Render check", content: page, visibility: "private", theme: null, kind: "html" });
  created.push(publicId);
  const row = await artifactRowOf(publicId);

  // A signed-out browser, as the hosted one is.
  const signedOut = await tab.context().browser()?.newContext();
  if (!signedOut) throw new Error("No browser to open a signed-out context in.");
  const browser = await signedOut.newPage();
  const token = mintRenderToken({ userId: ownerId, artifactId: row.id, stamp: row.updatedAt.getTime() }, new Date(), secret);
  await browser.goto(renderPagePath(token));
  await expect(browser.locator(pageShownSelector)).toBeVisible();
  await expect(browser.frameLocator(pageShownSelector).getByRole("heading", { name: "Hello from the page" })).toBeVisible();

  // A token for an older save, and a token that is not one, open nothing: one note, and no frame for the browser to find.
  for (const refused of [mintRenderToken({ userId: ownerId, artifactId: row.id, stamp: row.updatedAt.getTime() - 1000 }, new Date(), secret), `${token.slice(0, -2)}xx`]) {
    await browser.goto(renderPagePath(refused));
    await expect(browser.getByText("This page cannot be drawn.")).toBeVisible();
    await expect(browser.locator("iframe")).toHaveCount(0);
  }
  await signedOut.close();
});
