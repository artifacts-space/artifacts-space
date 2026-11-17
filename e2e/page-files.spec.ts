import type { APIRequestContext, Page } from "@playwright/test";

import { allowPageError, expect, test } from "./support/test";

/*
 * An HTML artifact's page loads its own files by relative path, from its
 * page host, under an address the site made for the viewer
 * (src/lib/page-files). The fixture (/dev/page-frame?page=files, no
 * database) is a page with a stylesheet, a picture the stylesheet names, a
 * module that imports its sibling, and data it fetches. The proxy, the
 * token, the route, the headers, and the frame are the real ones; only the
 * file lookup and the bytes are stood in for (fixture-source.ts).
 */

const frameSelector = "iframe[data-slot=page-frame]";

async function openFilesPage(page: Page) {
  allowPageError("Failed to load resource: the server responded with a status of 404", "The page asks for a file under an address that is not its own, on purpose.");
  allowPageError(/violates the following Content Security Policy directive|violates the document's Content Security Policy/, "The page asks for the site, which its policy refuses, on purpose.");
  await page.goto("/dev/page-frame?page=files");
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  return page.frameLocator(frameSelector);
}

/** The frame's address: the page host's origin and the page's files address. */
async function frameAddress(page: Page): Promise<URL> {
  return new URL((await page.locator(frameSelector).getAttribute("src")) ?? "");
}

/** A request to the server with another name in the Host header: the test runner, unlike a browser, cannot look up `<label>.localhost`. */
function askHost(request: APIRequestContext, baseURL: string | undefined, host: string, path: string, method: "GET" | "HEAD" | "POST" = "GET") {
  return request.fetch(`${new URL(baseURL ?? "").origin}${path}`, { method, headers: { host }, maxRedirects: 0, ...(method === "POST" ? { data: "x" } : {}) });
}

test("should load the page under its files address on its own page host", async ({ page, baseURL }) => {
  await openFilesPage(page);
  const address = await frameAddress(page);
  expect(address.origin).toMatch(/^http:\/\/[0-9a-f]{32}\.localhost:\d+$/);
  expect(address.origin).not.toBe(new URL(baseURL ?? "").origin);
  expect(address.pathname).toMatch(/^\/f\/[A-Za-z0-9_-]{60,400}\/index\.html$/);
});

test("should apply the page's stylesheet, loaded by relative path", async ({ page }) => {
  const frame = await openFilesPage(page);
  await expect(frame.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
});

test("should load a picture the stylesheet names, relative to the stylesheet", async ({ page }) => {
  const frame = await openFilesPage(page);
  await expect(frame.locator("#pictured")).toHaveCSS("background-image", /\/f\/[A-Za-z0-9_-]+\/img\/dot\.svg"\)$/);
  await expect(frame.locator("#picture")).toHaveText("loaded img/dot.svg");
});

test("should run a module script that imports its sibling module", async ({ page }) => {
  const frame = await openFilesPage(page);
  await expect(frame.locator("#module")).toHaveText("Module imported its sibling");
});

test("should let the page fetch its own data file", async ({ page }) => {
  const frame = await openFilesPage(page);
  await expect(frame.locator("#data")).toHaveText("answer 42");
});

test("should draw an image element from a page file", async ({ page }) => {
  const frame = await openFilesPage(page);
  await expect.poll(() => frame.locator("#image").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(24);
});

test("should give the page nothing under an address that is not its own, and still nothing of the site", async ({ page }) => {
  const frame = await openFilesPage(page);
  await expect(frame.locator("#other-address")).toHaveText("status 404");
  await expect(frame.locator("#site-fetch")).toHaveText("refused: TypeError");
});

test("should serve a page file with its own type, the page's policy, and a private cache no longer than its address", async ({ page, request, baseURL }) => {
  await openFilesPage(page);
  const address = await frameAddress(page);
  const base = address.pathname.replace(/index\.html$/, "");
  const script = await askHost(request, baseURL, address.host, `${base}js/app.js`);
  expect(script.status()).toBe(200);
  const headers = script.headers();
  expect(headers["content-type"]).toBe("text/javascript; charset=utf-8");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain(`frame-ancestors ${new URL(baseURL ?? "").origin}`);
  expect(headers["content-security-policy"]).toMatch(/; sandbox$/);
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
  expect(headers["set-cookie"]).toBeUndefined();
  const cache = /^private, max-age=(\d+)$/.exec(headers["cache-control"] ?? "");
  expect(Number(cache?.[1])).toBeGreaterThan(0);
  expect(Number(cache?.[1])).toBeLessThanOrEqual(15 * 60);
  expect(await script.text()).toContain('import { message } from "./message.js"');
  expect((await askHost(request, baseURL, address.host, `${base}css/site.css`)).headers()["content-type"]).toBe("text/css; charset=utf-8");
  expect((await askHost(request, baseURL, address.host, `${base}img/dot.svg`)).headers()["content-type"]).toBe("image/svg+xml; charset=utf-8");
  const head = await askHost(request, baseURL, address.host, `${base}data.json`, "HEAD");
  expect(head.status()).toBe(200);
  expect(await head.text()).toBe("");
});

test("should refuse a page file on every host but its own page host, and for every address but its own", async ({ page, request, baseURL }) => {
  await openFilesPage(page);
  const address = await frameAddress(page);
  const base = address.pathname.replace(/index\.html$/, "");
  const file = `${base}data.json`;
  const port = address.port ? `:${address.port}` : "";
  // The site's own host, another artifact's page host, and a host under the page domain that is no page host.
  for (const host of [new URL(baseURL ?? "").host, `${"0".repeat(32)}.localhost${port}`, `www.localhost${port}`]) {
    const response = await askHost(request, baseURL, host, file);
    expect(response.status(), host).toBe(404);
    expect(await response.text(), host).not.toContain("42");
  }
  // On its own host: a changed token, a file it does not have, a path that leaves the folder, a second document, and a write.
  const changed = file.replace(/\/f\/(.)/, (_whole, first: string) => `/f/${first === "A" ? "B" : "A"}`);
  for (const path of [changed, `${base}missing.json`, `${base}../data.json`, `${base}about.html`, `/f/${"A".repeat(120)}/data.json`]) {
    expect((await askHost(request, baseURL, address.host, path)).status(), path).toBe(404);
  }
  expect((await askHost(request, baseURL, address.host, file, "POST")).status()).toBe(405);
});

test("should keep a page without page files at the page host's root, as before", async ({ page }) => {
  await page.goto("/dev/page-frame?page=plain");
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  expect((await frameAddress(page)).pathname).toBe("/");
});
