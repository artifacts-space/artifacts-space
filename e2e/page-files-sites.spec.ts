import type { APIRequestContext, FrameLocator, Page } from "@playwright/test";

import { allowPageError, expect, test } from "./support/test";

/*
 * A site of several pages: index.html is the artifact's content, and every
 * other page is an `.html` page file, linked by relative path and shown in
 * the same frame (src/lib/page-host/frame-document.ts). The fixture
 * (/dev/page-frame?page=files, no database) has about.html, and
 * docs/guide.html with its own stylesheet and script beside it
 * (fixture-source.ts). The proxy, the token, the route, the headers, and the
 * frame are the real ones; only the file lookup and the bytes are stood in.
 */

const frameSelector = "iframe[data-slot=page-frame]";

/** What the frame logs on purpose while these tests run: the first page's own refused requests, and a page that has no file. */
function allowSiteErrors() {
  allowPageError("Failed to load resource: the server responded with a status of 404", "The pages ask for files that are not there, on purpose.");
  allowPageError(/violates the following Content Security Policy directive|violates the document's Content Security Policy/, "The first page asks for the site, and a page sends a form, which its policy refuses, on purpose.");
}

async function openSite(page: Page, query = "") {
  allowSiteErrors();
  await page.goto(`/dev/page-frame?page=files${query}`);
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  const frame = page.frameLocator(frameSelector);
  await expect(frame.locator("#module")).toHaveText("Module imported its sibling");
  return frame;
}

/** The frame document's address now: path, query, and hash. */
function frameLocation(frame: FrameLocator): Promise<{ path: string; search: string; hash: string }> {
  return frame.locator("body").evaluate(() => ({ path: location.pathname, search: location.search, hash: location.hash }));
}

/** The address the frame first loaded: the page host's origin and the first page under its files address. */
async function frameAddress(page: Page): Promise<URL> {
  return new URL((await page.locator(frameSelector).getAttribute("src")) ?? "");
}

/** A request to the server with the page host's name in the Host header: the test runner cannot look up `<label>.localhost`. */
function askHost(request: APIRequestContext, baseURL: string | undefined, host: string, path: string, headers: Record<string, string> = {}) {
  return request.fetch(`${new URL(baseURL ?? "").origin}${path}`, { method: "GET", headers: { host, ...headers }, maxRedirects: 0 });
}

const filesBase = (address: URL) => address.pathname.replace(/index\.html$/, "");

test("should open another page of the site from a link, in the same frame, with the site's stylesheet", async ({ page }) => {
  const frame = await openSite(page);
  const first = await frameAddress(page);
  await frame.locator("#to-about").click();
  await expect(frame.locator("#page")).toHaveText("About");
  await expect(frame.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
  expect((await frameLocation(frame)).path).toBe(`${filesBase(first)}about.html`);
  // The frame's own address never changed: the page moved inside it.
  expect((await frameAddress(page)).pathname).toBe(first.pathname);
  expect(new URL(page.url()).pathname).toBe("/dev/page-frame");
});

test("should load a page in a folder with its own stylesheet and script, keep its query and hash, and follow its links up and across", async ({ page }) => {
  const frame = await openSite(page);
  const base = filesBase(await frameAddress(page));
  await frame.locator("#to-guide").click();
  await expect(frame.locator("#page")).toHaveText("Guide");
  await expect(frame.locator("#guide-styled")).toHaveCSS("color", "rgb(0, 0, 255)");
  await expect(frame.locator("#guide-script")).toHaveText("Guide script ran");
  await expect(frame.locator("#where")).toHaveText("?tab=2#top");
  expect(await frameLocation(frame)).toEqual({ path: `${base}docs/guide.html`, search: "?tab=2", hash: "#top" });

  await frame.locator("#to-intro").click();
  await expect(frame.locator("#page")).toHaveText("Intro");
  expect((await frameLocation(frame)).path).toBe(`${base}docs/intro.html`);
  await frame.locator("#to-guide").click();
  await expect(frame.locator("#page")).toHaveText("Guide");
  await frame.locator("#to-index").click();
  // The first page is the artifact's content again, with its files.
  await expect(frame.locator("#module")).toHaveText("Module imported its sibling");
  await expect(frame.locator("#data")).toHaveText("answer 42");
  expect((await frameLocation(frame)).path).toBe(`${base}index.html`);
});

test("should move between the pages with the browser's Back and Forward, and show the first page again", async ({ page }) => {
  const frame = await openSite(page);
  await frame.locator("#to-about").click();
  await expect(frame.locator("#page")).toHaveText("About");
  await page.evaluate(() => { history.back(); });
  await expect(frame.locator("#module")).toHaveText("Module imported its sibling");
  await expect(frame.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
  await page.evaluate(() => { history.forward(); });
  await expect(frame.locator("#page")).toHaveText("About");
  await page.evaluate(() => { history.back(); });
  await expect(frame.locator("#data")).toHaveText("answer 42");
  await expect(page.locator("[data-slot=page-frame-left]")).toHaveCount(0);
});

test("should go to a page from a script, as from a link", async ({ page }) => {
  const frame = await openSite(page);
  // The page's own script, in the frame: the destination is passed in, as the page would hold it.
  await frame.locator("body").evaluate((_body, target) => { location.href = target; }, "about.html");
  await expect(frame.locator("#page")).toHaveText("About");
});

test("should say when a page has no file, as text, with a link back to the first page", async ({ page }) => {
  const frame = await openSite(page);
  await frame.locator("#to-missing").click();
  await expect(frame.locator("body")).toContainText("This page has no file at missing.html.");
  // Nothing of the address became markup: the line is two paragraphs and one link.
  expect(await frame.locator("body").evaluate(() => [...document.body.children].filter((child) => child.tagName !== "SCRIPT").map((child) => child.outerHTML))).toEqual([
    "<p>This page has no file at missing.html.</p>",
    '<p><a href="index.html">Go to the first page</a></p>',
  ]);
  await frame.getByRole("link", { name: "Go to the first page" }).click();
  await expect(frame.locator("#module")).toHaveText("Module imported its sibling");
});

test("should still refuse a form, even one that names another page of the site", async ({ page }) => {
  const frame = await openSite(page);
  await frame.locator("#to-about").click();
  await expect(frame.locator("#page")).toHaveText("About");
  const refused = frame.locator("body").evaluate(() => new Promise<string>((resolve) => {
    document.addEventListener("securitypolicyviolation", (event) => { resolve(event.violatedDirective); });
  }));
  await frame.locator("#submit").click();
  expect(await refused).toBe("form-action");
  await expect(frame.locator("#page")).toHaveText("About");
});

test("should keep the frame open on another page of the site, past the time the site waits for an answer", async ({ page }) => {
  test.slow();
  const frame = await openSite(page);
  await frame.locator("#to-about").click();
  await expect(frame.locator("#page")).toHaveText("About");
  // Longer than PAGE_ANSWER_MS: the frame document at about.html answered the site's question.
  await page.waitForTimeout(9000);
  await expect(page.locator("[data-slot=page-frame-left]")).toHaveCount(0);
  await expect(frame.locator("#page")).toHaveText("About");
});

test("should give a browser that goes to a page's address the frame document, and only the frame document's fetch its source, as text", async ({ page, request, baseURL }) => {
  await openSite(page);
  const address = await frameAddress(page);
  const path = `${filesBase(address)}about.html?tab=2`;

  const navigation = await askHost(request, baseURL, address.host, path, { "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate" });
  expect(navigation.status()).toBe(200);
  expect(navigation.headers()["content-type"]).toBe("text/html; charset=utf-8");
  // The server may add its own (Accept-Encoding when it compresses); ours must be there.
  expect(navigation.headers().vary).toMatch(/(^|, )X-Page-Source(,|$)/);
  const framed = await navigation.text();
  expect(framed).toContain("artifact-page:opened");
  expect(framed).not.toContain("About");

  const source = await askHost(request, baseURL, address.host, path, { "x-page-source": "1", "sec-fetch-dest": "empty", "sec-fetch-site": "same-origin" });
  expect(source.status()).toBe(200);
  expect(source.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(source.headers()["x-content-type-options"]).toBe("nosniff");
  expect(source.headers().vary).toMatch(/(^|, )X-Page-Source(,|$)/);
  expect(source.headers()["content-security-policy"]).toMatch(/; sandbox$/);
  expect(source.headers()["cache-control"]).toMatch(/^private, max-age=\d+$/);
  expect(await source.text()).toContain('<h1 id="page">About</h1>');

  // The header on anything that is not a same-origin fetch does not get the source; nor does a page that is not there.
  for (const headers of [{ "x-page-source": "1", "sec-fetch-dest": "document" }, { "x-page-source": "1", "sec-fetch-site": "cross-site" }, { "x-page-source": "yes" }]) {
    const response = await askHost(request, baseURL, address.host, path, headers);
    expect(await response.text(), JSON.stringify(headers)).not.toContain('<h1 id="page">About</h1>');
    expect(response.headers()["content-type"]).not.toBe("text/plain; charset=utf-8");
  }
  expect((await askHost(request, baseURL, address.host, `${filesBase(address)}missing.html`, { "x-page-source": "1" })).status()).toBe(404);
});

test("should open no folder index: a folder's address goes to the same address without its slash, which is no page", async ({ page, request, baseURL }) => {
  await openSite(page);
  const address = await frameAddress(page);
  const folder = await askHost(request, baseURL, address.host, `${filesBase(address)}docs/`);
  expect(folder.status()).toBe(308);
  expect(folder.headers().location).toMatch(/\/docs$/);
  const bare = await askHost(request, baseURL, address.host, `${filesBase(address)}docs`);
  expect(bare.status()).toBe(404);
  expect(bare.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("should keep the token rules for a page's source: another token, another host, the site's own host", async ({ page, request, baseURL }) => {
  await openSite(page);
  const address = await frameAddress(page);
  const path = `${filesBase(address)}about.html`;
  const changed = path.replace(/\/f\/(.)/, (_whole, first: string) => `/f/${first === "A" ? "B" : "A"}`);
  const port = address.port ? `:${address.port}` : "";
  const source = { "x-page-source": "1" };
  expect((await askHost(request, baseURL, address.host, changed, source)).status()).toBe(404);
  expect((await askHost(request, baseURL, address.host, `/f/${"A".repeat(120)}/about.html`, source)).status()).toBe(404);
  for (const host of [new URL(baseURL ?? "").host, `${"0".repeat(32)}.localhost${port}`, `www.localhost${port}`]) {
    const response = await askHost(request, baseURL, host, path, source);
    expect(response.status(), host).toBe(404);
    expect(await response.text(), host).not.toContain("About");
  }
});

test("should show nothing, and fetch nothing, at a page's address in a tab of its own", async ({ page, context }) => {
  await openSite(page);
  const address = await frameAddress(page);
  const tab = await context.newPage();
  const asked: string[] = [];
  tab.on("request", (sent) => { if (sent.headers()["x-page-source"] !== undefined) asked.push(sent.url()); });
  await tab.goto(`${address.origin}${filesBase(address)}about.html`);
  await expect(tab.locator("body")).toHaveText("");
  expect(asked).toEqual([]);
  await tab.close();
});

/*
 * Renewal while the frame is on another page of the site. The fixture's
 * first address ends within seconds (`?pass=short`, fixtureShortPassAction);
 * the site hands the next one to the frame document on whatever page it is.
 */

type MarkedWindow = Window & { kept?: string };

/** Waits until the page host refuses the address the frame first loaded under: it has ended. */
async function firstAddressEnded(request: APIRequestContext, baseURL: string | undefined, first: URL) {
  await expect.poll(async () => (await askHost(request, baseURL, first.host, `${filesBase(first)}data.json`)).status(), { timeout: 30_000 }).toBe(404);
}

test("should renew the address while the frame is on another page, keep that page running, and use the new address for its later requests and links", async ({ page, request, baseURL }) => {
  const frame = await openSite(page, `&pass=short&run=${crypto.randomUUID()}`);
  const first = await frameAddress(page);
  await frame.locator("#to-guide").click();
  await expect(frame.locator("#guide-script")).toHaveText("Guide script ran");
  await frame.locator("body").evaluate(() => { (window as MarkedWindow).kept = "since the guide loaded"; });
  await firstAddressEnded(request, baseURL, first);

  await expect.poll(() => frame.locator("body").evaluate(async () => (await fetch("../data.json", { cache: "no-store" })).status)).toBe(200);
  const state = await frame.locator("body").evaluate(() => ({ path: location.pathname, search: location.search, hash: location.hash, kept: (window as MarkedWindow).kept }));
  expect(state.path).toMatch(/^\/f\/[A-Za-z0-9_-]{60,400}\/docs\/guide\.html$/);
  expect(state.path.startsWith(filesBase(first)), "the guide moved to the next address").toBe(false);
  expect(state).toMatchObject({ search: "?tab=2", hash: "#top", kept: "since the guide loaded" });

  // A link followed after the first address ended opens under the new one, and so does Back to the first page.
  await frame.locator("#to-intro").click();
  await expect(frame.locator("#page")).toHaveText("Intro");
  expect((await frameLocation(frame)).path.startsWith(filesBase(first))).toBe(false);
  await page.evaluate(() => { history.go(-2); });
  await expect(frame.locator("#data")).toHaveText("answer 42");
  await expect(frame.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
  await expect(page.locator("[data-slot=page-frame-left]")).toHaveCount(0);
});
