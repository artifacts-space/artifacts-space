import { allowPageError, expect, test } from "./support/test";

// These run on about:blank with inline pages, so they need no server.

test("should pass when the page reports no errors", async ({ page }) => {
  await page.setContent("<p>Clean</p><script>console.log('fine'); console.info('fine too');</script>");
  await expect(page.getByText("Clean")).toBeVisible();
});

test("should fail when the page throws during an interaction", async ({ page }) => {
  test.fail(true, "The shared fixture fails a test whose page threw.");
  await page.setContent(`<button onclick="throw new Error('boom from a click')">Go</button>`);
  await Promise.all([page.waitForEvent("pageerror"), page.getByRole("button", { name: "Go" }).click()]);
});

test("should fail when the page logs a console error", async ({ page }) => {
  test.fail(true, "The shared fixture fails a test whose page logged an error.");
  await page.setContent("<p>Logged</p><script>console.error('logged on purpose')</script>");
  await expect(page.getByText("Logged")).toBeVisible();
});

test("should fail when a page in a context the test opened logs an error", async ({ browser }) => {
  test.fail(true, "The shared fixture watches contexts a test opens itself.");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent("<p>Own context</p><script>console.error('from a second context')</script>");
  await expect(page.getByText("Own context")).toBeVisible();
  await context.close();
});

test("should pass when the test allows the error it causes", async ({ page }) => {
  allowPageError("expected on purpose", "This test checks that an allowed error passes.");
  allowPageError(/thrown on purpose/, "This test checks that an allowed exception passes.");
  await page.setContent(`<p>Allowed</p><button onclick="console.error('expected on purpose'); throw new Error('thrown on purpose')">Go</button>`);
  await Promise.all([page.waitForEvent("pageerror"), page.getByRole("button", { name: "Go" }).click()]);
});
