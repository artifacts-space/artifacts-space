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

/*
 * A page that stays open past its files address. The fixture's first
 * address ends within seconds (`?pass=`, fixtureShortPassAction); the site
 * gets the next one and hands it to the frame document, which moves its own
 * address without loading again (page-renewal.ts, frame-document.ts).
 */

interface PageState {
  /** What a relative fetch of the page's data file answers. */
  status: number;
  /** The frame document's own address now. */
  path: string;
  /** A mark left in the page's window when it first loaded: gone if the page loaded again. */
  kept: string | undefined;
}

type MarkedWindow = Window & { kept?: string; setTabShown?: (shown: boolean) => void };

/**
 * Opens the files page with a first address that ends within seconds, leaves
 * a mark in its window, and counts the site's address requests. `loaded` is
 * how many the load itself made (development mode runs each effect twice,
 * so more than one): every later one is a renewal.
 */
async function openShortPassPage(page: Page, mode: "short" | "refused") {
  const asks = { count: 0 };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) asks.count += 1;
  });
  allowPageError("Failed to load resource: the server responded with a status of 404", "The page asks for a file after its address ended, on purpose.");
  allowPageError(/violates the following Content Security Policy directive|violates the document's Content Security Policy/, "The page asks for the site, which its policy refuses, on purpose.");
  await page.goto(`/dev/page-frame?page=files&pass=${mode}&run=${crypto.randomUUID()}`);
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  const frame = page.frameLocator(frameSelector);
  await expect(frame.locator("#data")).toHaveText("answer 42");
  await frame.locator("body").evaluate(() => { (window as MarkedWindow).kept = "since the first load"; });
  return { frame, asks, loaded: asks.count, first: await frameAddress(page) };
}

/** Asked inside the page: a relative fetch, the document's address, and the mark. */
function pageState(frame: ReturnType<Page["frameLocator"]>): Promise<PageState> {
  return frame.locator("body").evaluate(async () => {
    const response = await fetch("data.json", { cache: "no-store" });
    return { status: response.status, path: location.pathname, kept: (window as MarkedWindow).kept };
  });
}

/** Waits until the page host refuses the address the frame first loaded under: it has ended. */
async function firstAddressEnded(request: APIRequestContext, baseURL: string | undefined, first: URL) {
  const file = `${first.pathname.replace(/index\.html$/, "")}data.json`;
  await expect.poll(async () => (await askHost(request, baseURL, first.host, file)).status(), { timeout: 30_000 }).toBe(404);
}

test("should keep an open page loading its files after its first address ended, without loading the page again", async ({ page, request, baseURL }) => {
  const { frame, asks, loaded, first } = await openShortPassPage(page, "short");
  await firstAddressEnded(request, baseURL, first);

  const state = await pageState(frame);
  expect(state.status, "a relative fetch after the first address ended").toBe(200);
  expect(state.path).toMatch(/^\/f\/[A-Za-z0-9_-]{60,400}\/index\.html$/);
  expect(state.path, "the frame document moved to the next address").not.toBe(first.pathname);
  expect(state.kept, "the page was loaded again").toBe("since the first load");
  // The frame itself was never pointed anywhere new, and the site asked once more: no interval.
  expect((await frameAddress(page)).pathname).toBe(first.pathname);
  expect(asks.count - loaded).toBe(1);
  // An element the page adds later loads by relative path under the new address.
  const drawn = await frame.locator("body").evaluate(() => new Promise<number>((resolve) => {
    const image = new Image();
    image.onload = () => { resolve(image.naturalWidth); };
    image.onerror = () => { resolve(0); };
    image.src = "img/dot.svg?later";
  }));
  expect(drawn).toBe(24);
});

test("should ask for nothing while the tab is hidden, and renew at once when it is shown again with an address that ended", async ({ page, request, baseURL }) => {
  await page.addInitScript(() => {
    let state: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    (window as MarkedWindow).setTabShown = (shown) => {
      state = shown ? "visible" : "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  const { frame, asks, loaded, first } = await openShortPassPage(page, "short");
  await page.evaluate(() => { (window as MarkedWindow).setTabShown?.(false); });
  await firstAddressEnded(request, baseURL, first);

  // Hidden past the end of its address: nothing was asked, and the page's files are out of reach.
  const hidden = await pageState(frame);
  expect(asks.count - loaded, "the site asked for an address while the tab was hidden").toBe(0);
  expect(hidden).toEqual({ status: 404, path: first.pathname, kept: "since the first load" });

  await page.evaluate(() => { (window as MarkedWindow).setTabShown?.(true); });
  await expect.poll(async () => (await pageState(frame)).status).toBe(200);
  const shown = await pageState(frame);
  expect(shown.path).not.toBe(first.pathname);
  expect(shown.kept).toBe("since the first load");
  expect(asks.count - loaded).toBe(1);
});

test("should give a reader who lost access no new address, and keep the page running without its files", async ({ page, request, baseURL }) => {
  const { frame, asks, loaded, first } = await openShortPassPage(page, "refused");
  await firstAddressEnded(request, baseURL, first);
  await expect.poll(() => asks.count - loaded).toBe(1);

  const state = await pageState(frame);
  expect(state).toEqual({ status: 404, path: first.pathname, kept: "since the first load" });
  // The page is still there: not closed, not loaded again, and what it drew stays.
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible();
  await expect(page.locator("[data-slot=page-frame-left]")).toHaveCount(0);
  await expect(frame.locator("#module")).toHaveText("Module imported its sibling");
  // A refusal is final for this load: showing the tab again asks nothing more.
  await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); });
  expect((await pageState(frame)).status).toBe(404);
  expect(asks.count - loaded).toBe(1);
});

test("should not let the page move its own files address with a message of its own, while the site's message does", async ({ page }) => {
  const frame = await openFilesPage(page);
  const first = await frameAddress(page);
  const other = `/f/${"A".repeat(120)}/index.html`;

  // The page posts the renewal message to itself and waits until a later message of its own arrived.
  const after = await frame.locator("body").evaluate((_body, path) => new Promise<string>((resolve) => {
    window.addEventListener("message", (event) => { if (event.data === "after") resolve(location.pathname); });
    window.postMessage({ type: "artifact-page:renew", path }, "*");
    window.postMessage("after", "*");
  }), other);
  expect(after).toBe(first.pathname);

  // The same message from the site, in the framing window, moves it: the listener is there, and it chose not to act above.
  await page.locator(frameSelector).evaluate((element, path) => {
    (element as HTMLIFrameElement).contentWindow?.postMessage({ type: "artifact-page:renew", path }, "*");
  }, other);
  await expect.poll(() => frame.locator("body").evaluate(() => location.pathname)).toBe(other);
});
