import type { APIRequestContext, Page } from "@playwright/test";

import { allowPageError, expect, test } from "./support/test";

/*
 * An HTML artifact's page runs in a sandboxed iframe on its own page host
 * (src/lib/page-host/rules.ts), never on the site's origin. The fixture
 * (/dev/page-frame, no database) shows a page that tries each way out and
 * reports what happened, so these tests read the sandbox from inside.
 */

const frameSelector = "iframe[data-slot=page-frame]";

/** The probe page tries each way out; the browser logs every refusal as an error. */
function expectRefusals() {
  allowPageError(/violates the following Content Security Policy directive|violates the document's Content Security Policy/, "The probe page makes requests and a frame that its policy refuses, on purpose.");
  allowPageError("Unsafe attempt to initiate navigation", "The probe page tries to navigate the tab, which its sandbox refuses, on purpose.");
}

async function openProbe(page: Page) {
  expectRefusals();
  await page.goto("/dev/page-frame?page=probe");
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  return page.frameLocator(frameSelector);
}

/** The page host's origin for the frame on the page. */
async function frameOrigin(page: Page): Promise<string> {
  const src = await page.locator(frameSelector).getAttribute("src");
  return new URL(src ?? "").origin;
}

/**
 * A request to the page host, sent to the server with the page host's name
 * in the Host header: the test runner, unlike a browser, cannot look up
 * `<label>.localhost`.
 */
function askPageHost(request: APIRequestContext, baseURL: string | undefined, origin: string, path: string, method: "GET" | "POST" = "GET") {
  return request.fetch(`${new URL(baseURL ?? "").origin}${path}`, { method, headers: { host: new URL(origin).host }, maxRedirects: 0, ...(method === "POST" ? { data: "x" } : {}) });
}

test("should run the page's script on its own host, not on the site's origin", async ({ page, baseURL }) => {
  const probe = await openProbe(page);
  await expect(probe.locator("#ran")).toHaveText("Script ran");
  const origin = await frameOrigin(page);
  expect(origin).toMatch(/^http:\/\/[0-9a-f]{32}\.localhost:\d+$/);
  expect(origin).not.toBe(new URL(baseURL ?? "").origin);
  await expect(probe.locator("#origin")).toHaveText(origin);
});

test("should keep the page away from the site, the network, and the tab", async ({ page }) => {
  const probe = await openProbe(page);
  await expect(probe.locator("#parent")).toHaveText("refused: SecurityError");
  await expect(probe.locator("#site-fetch")).toHaveText("refused: TypeError");
  await expect(probe.locator("#other-fetch")).toHaveText("refused: TypeError");
  await expect(probe.locator("#top")).toHaveText("refused: SecurityError");
  await expect(probe.locator("#frame")).toHaveText(/^refused: frame-src/);
  expect(new URL(page.url()).pathname).toBe("/dev/page-frame");
});

test("should let the page keep its own browser storage", async ({ page }) => {
  const probe = await openProbe(page);
  await expect(probe.locator("#storage")).toHaveText("kept");
});

test("should show a new version in a fresh frame document when the page changes", async ({ page }) => {
  const probe = await openProbe(page);
  await expect(probe.locator("#version")).toHaveCount(0);
  await page.getByRole("button", { name: "Save a new version" }).click();
  await expect(page.frameLocator(frameSelector).locator("#version")).toHaveText("Version 2");
  await expect(page.frameLocator(frameSelector).locator("#ran")).toHaveText("Script ran");
});

test("should close a page that sends its frame to another address, and show it again when asked", async ({ page }) => {
  test.slow();
  allowPageError("Failed to load resource: the server responded with a status of 404", "The page sends its frame to an address the page host does not serve, on purpose.");
  allowPageError(/Framing .* violates the following Content Security Policy directive: "frame-ancestors 'none'"/, "The page host's 404 answer may not be framed, so the browser refuses to show it.");
  allowPageError("does not match the recipient window's origin", "The frame holds another document, so the site's question is not delivered, on purpose.");
  await page.goto("/dev/page-frame?page=leave");
  await expect(page.locator("[data-slot=page-frame-left]")).toContainText("This page tried to show another address in its place, so it was closed.", { timeout: 15_000 });
  await expect(page.locator(frameSelector)).toHaveCount(0);
  await page.getByRole("button", { name: "Show the page again" }).click();
  await expect(page.frameLocator(frameSelector).locator("#text")).toHaveText("Leaving.");
});

test("should keep showing a page that reloads itself", async ({ page }) => {
  test.slow();
  await page.goto("/dev/page-frame?page=reload");
  await expect(page.frameLocator(frameSelector).locator("#text")).toHaveText("Reloaded once.");
  // Longer than the site waits for the frame document's answer.
  await page.waitForTimeout(9000);
  await expect(page.locator("[data-slot=page-frame-left]")).toHaveCount(0);
  await expect(page.frameLocator(frameSelector).locator("#text")).toHaveText("Reloaded once.");
});

test("should show a page without colors as black on white, whatever the site's theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/dev/page-frame?page=plain");
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  const background = await page.locator(frameSelector).evaluate((frame) => getComputedStyle(frame).backgroundColor);
  expect(background).toBe("rgb(255, 255, 255)");
});

test("should draw no frame where no page host is set up", async ({ page }) => {
  await page.goto("/dev/page-frame?page=plain&host=none");
  await expect(page.locator("[data-slot=page-frame-box]")).toBeVisible();
  await expect(page.locator(frameSelector)).toHaveCount(0);
});

test("should serve nothing on a page host but the frame document", async ({ page, request, baseURL }) => {
  await openProbe(page);
  const origin = await frameOrigin(page);
  for (const path of ["/app", "/sign-in", "/api/auth/get-session", "/artifact/abc", "/dev/page-frame", "/docs", "/_next/static/chunks/main.js", "/favicon.ico", "/mcp"]) {
    const response = await askPageHost(request, baseURL, origin, path);
    expect(response.status(), path).toBe(404);
    expect(await response.text(), path).toBe("Not found");
  }
  expect((await askPageHost(request, baseURL, origin, "/", "POST")).status()).toBe(405);
  expect((await askPageHost(request, baseURL, origin, "/api/auth/sign-in/email", "POST")).status()).toBe(404);
  // The same paths exist on the site itself: the Host decides.
  expect((await request.get("/docs")).status()).toBe(200);
});

test("should send the frame document with the page policy, framed by the site only", async ({ page, request, baseURL }) => {
  await openProbe(page);
  const origin = await frameOrigin(page);
  const response = await askPageHost(request, baseURL, origin, "/");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  const policy = headers["content-security-policy"] ?? "";
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain(`frame-ancestors ${new URL(baseURL ?? "").origin}`);
  expect(policy).toContain("form-action 'none'");
  expect(policy).not.toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBeUndefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["set-cookie"]).toBeUndefined();
  expect(await response.text()).not.toContain("Script ran");
});

test("should show nothing when a page host's address opens in a tab of its own", async ({ page, context }) => {
  await openProbe(page);
  const origin = await frameOrigin(page);
  const tab = await context.newPage();
  await tab.goto(`${origin}/`);
  await expect(tab.locator("body")).toHaveText("");
  await tab.close();
});

test("should still forbid framing the site's own pages", async ({ request }) => {
  const headers = (await request.get("/dev/page-frame")).headers();
  expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
});
