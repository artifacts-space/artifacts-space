import { expect, test, type Page } from "@playwright/test";

/**
 * Theme fonts load only where a theme uses them. Runs against the production
 * build (the "production" project in playwright.config.ts), because only
 * production HTML shows the real preload tags. The site's own Geist files
 * come from /_next/static/media; every theme face lives under /fonts/v1/<id>/.
 */

const themeFontPath = /\/fonts\/v1\/([a-z0-9-]+)\//;

/** Every request for a font file or a theme font stylesheet, as URLs. */
function recordFontRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (request.resourceType() === "font" || url.endsWith(".woff2") || themeFontPath.test(url)) urls.push(url);
  });
  return urls;
}

function themeFaces(urls: readonly string[]): string[] {
  return [...new Set(urls.flatMap((url) => themeFontPath.exec(url)?.[1] ?? []))].sort();
}

async function openPreview(page: Page) {
  await page.goto("/preview");
  await expect(page.getByRole("heading", { name: "Artifact preview", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Drawing diagram" })).toHaveCount(0, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}

test("should request no theme font files when the page shows the Default theme", async ({ page, baseURL }) => {
  const fonts = recordFontRequests(page);
  await openPreview(page);

  expect(themeFaces(fonts)).toEqual([]);
  expect(fonts.length, "Geist still loads").toBeGreaterThan(0);
  for (const url of fonts) expect(new URL(url).origin, url).toBe(new URL(baseURL ?? "").origin);
});

test("should request only Roboto and JetBrains Mono when the Classic preset is chosen", async ({ page, baseURL }) => {
  const fonts = recordFontRequests(page);
  await openPreview(page);
  expect(themeFaces(fonts)).toEqual([]);

  await page.getByRole("button", { name: "Classic", exact: true }).click();
  await expect(page.getByRole("button", { name: "Classic", exact: true })).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator('[data-preview-theme="light"]').first();
  await expect(panel).toHaveCSS("font-family", /^Roboto/);
  await expect(page.locator('[data-preview-theme] [data-code-block] pre').first()).toHaveCSS("font-family", /^"JetBrains Mono"/);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  expect(themeFaces(fonts)).toEqual(["jetbrains-mono", "roboto"]);
  // Only the body face is preloaded; the code face loads when code appears.
  const headLinks = await page.locator('head link[href*="/fonts/v1/"]').evaluateAll((links) => links.map((link) => `${link.getAttribute("rel") ?? ""} ${link.getAttribute("href") ?? ""}`));
  // React also preloads each stylesheet it inserts (rel=preload as=style).
  expect(headLinks.filter((link) => link.endsWith(".woff2"))).toEqual(["preload /fonts/v1/roboto/roboto-normal-100-900.woff2"]);
  expect(headLinks.filter((link) => link.startsWith("stylesheet")).sort()).toEqual(["stylesheet /fonts/v1/jetbrains-mono/font.css", "stylesheet /fonts/v1/roboto/font.css"]);
  expect(themeFaces(headLinks)).toEqual(["jetbrains-mono", "roboto"]);
  expect(fonts.filter((url) => url.endsWith(".woff2") && themeFontPath.test(url)).length).toBeGreaterThanOrEqual(2);
  for (const url of fonts) expect(new URL(url).origin, url).toBe(new URL(baseURL ?? "").origin);
});

test("should send no preload or stylesheet for theme faces in the production HTML when the theme is Default", async ({ request }) => {
  const response = await request.get("/preview");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  // Next sends font preloads in the Link header; React may also write <link rel="preload"> tags.
  const headerPreloads = (response.headers().link ?? "").split(/,\s*(?=<)/).filter((entry) => entry.includes("rel=preload") && entry.includes('as="font"'));
  const tagPreloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*>/g)].map((match) => match[0]).filter((tag) => tag.includes('as="font"'));
  const fontPreloads = [...headerPreloads, ...tagPreloads];

  expect(fontPreloads.length, "Geist is preloaded").toBeGreaterThan(0);
  for (const entry of fontPreloads) expect(entry).toContain("/_next/static/media/");
  expect(response.headers().link ?? "").not.toMatch(themeFontPath);
  expect(html).not.toMatch(themeFontPath);
});
