import { expect, test, type APIRequestContext } from "@playwright/test";

import { OG_DESCRIPTION, OG_WORDMARK } from "../src/lib/site-copy";

/*
 * Link previews as Slack sees them, on the production build with no database
 * (as in CI). Next merges a page's openGraph and twitter tags with the root's
 * file-based opengraph-image and twitter-image, and Slackbot gets blocking
 * metadata in <head>, so only the built HTML shows what a crawler reads.
 * Every page that cannot show an artifact preview must still carry the site
 * image and the brand icons, and never the Next.js default favicon.
 */

const slackbot = { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" };

/** The attributes of every <tagName> tag in <head>, whatever their order or spacing. */
function headTags(html: string, tagName: "meta" | "link"): Map<string, string>[] {
  const head = html.split("</head>")[0] ?? "";
  return (head.match(new RegExp(`<${tagName}\\s[^>]*>`, "g")) ?? []).map(
    (tag) => new Map(Array.from(tag.matchAll(/([\w:-]+)="([^"]*)"/g), ([, name, value]) => [name ?? "", value ?? ""])),
  );
}

/** The content of the first <meta> in <head> whose property or name is `key`, or null. */
function headMeta(html: string, key: string): string | null {
  const tag = headTags(html, "meta").find((attrs) => attrs.get("property") === key || attrs.get("name") === key);
  return tag?.get("content") ?? null;
}

/** The href of the first <link> in <head> with this rel (and type, when given), or null. */
function headLink(html: string, rel: string, type?: string): string | null {
  const tag = headTags(html, "link").find((attrs) => attrs.get("rel") === rel && (!type || attrs.get("type") === type));
  return tag?.get("href") ?? null;
}

/**
 * The path and query of a tag's URL. Tags carry metadataBase's host, not this
 * test server's, so only the path is fetched here; a relative URL is kept as is.
 */
function localPath(url: string): string {
  if (url.startsWith("/")) return url;
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

/** Fetches an image URL from a tag as Slack would, on this server, and returns its size. */
async function fetchPng(request: APIRequestContext, url: string) {
  const response = await request.get(localPath(url), { headers: slackbot });
  expect(response.status(), url).toBe(200);
  expect(response.headers()["content-type"], url).toBe("image/png");
  return pngSize(await response.body());
}

async function page(request: APIRequestContext, path: string) {
  const response = await request.get(path, { headers: slackbot, failOnStatusCode: false });
  return { status: response.status(), html: await response.text() };
}

const previewPages = [
  { name: "the home page", path: "/", status: 200 },
  // Not a valid public id, so the read check answers 404 without a database, as for any private, team, or missing artifact.
  { name: "an artifact a signed-out reader cannot open", path: "/artifact/not-a-real-id", status: 404 },
];

for (const { name, path, status } of previewPages) {
  test(`should give Slack the site title, description, and 1200x630 image when it unfurls ${name}`, async ({ request }) => {
    const response = await page(request, path);
    expect(response.status).toBe(status);
    expect(headMeta(response.html, "og:title")).toBe(OG_WORDMARK);
    expect(headMeta(response.html, "og:description")).toBe(OG_DESCRIPTION);
    for (const key of ["og:image", "twitter:image"]) {
      const url = headMeta(response.html, key);
      expect(url, key).toBeTruthy();
      expect(await fetchPng(request, url ?? ""), key).toEqual({ width: 1200, height: 630 });
    }
  });

  test(`should link the brand favicon and Apple touch icon when Slack unfurls ${name}`, async ({ request }) => {
    const { html } = await page(request, path);
    expect(headLink(html, "icon", "image/x-icon")).toMatch(/^\/favicon\.ico/);
    const apple = headLink(html, "apple-touch-icon");
    expect(apple).toMatch(/^\/apple-icon\.png/);
    expect(await fetchPng(request, apple ?? "")).toEqual({ width: 180, height: 180 });
  });
}

/** The ICO directory: each entry's width and the offset of its image. */
function icoEntries(ico: Buffer): { width: number; offset: number }[] {
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ({ width: ico[6 + i * 16] ?? 0, offset: ico.readUInt32LE(6 + i * 16 + 12) }));
}

/** Pixels in one 32-bit BMP entry of an ICO whose blue channel clearly beats red. */
function bluePixels(ico: Buffer, entry: { width: number; offset: number }): number {
  const pixels = entry.offset + ico.readUInt32LE(entry.offset);
  let blue = 0;
  for (let i = 0; i < entry.width * entry.width; i++) {
    const b = ico[pixels + i * 4] ?? 0;
    const r = ico[pixels + i * 4 + 2] ?? 0;
    if (b - r > 60) blue++;
  }
  return blue;
}

test("should serve a 48, 32, and 16 pixel brand favicon, not the Next.js default", async ({ request }) => {
  const response = await request.get("/favicon.ico", { headers: slackbot });
  expect(response.status()).toBe(200);
  const body = await response.body();
  expect(body.readUInt16LE(2)).toBe(1);
  const entries = icoEntries(body);
  // Next reads the first entry for the link's sizes attribute, so 48 px goes first.
  expect(entries.map((entry) => entry.width)).toEqual([48, 32, 16]);
  const large = entries.find((entry) => entry.width === 48);
  expect(large).toBeDefined();
  // create-next-app's default is a black and white "N" of the same sizes; the brand planet is blue.
  expect(large ? bluePixels(body, large) : 0).toBeGreaterThan(300);
});

test("should answer an unknown artifact's preview image with the site image", async ({ request }) => {
  const response = await request.get("/artifact/not-a-real-id/og/00000000-0000-0000-0000-000000000000.AAAAAAAAAA", { headers: slackbot });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(pngSize(await response.body())).toEqual({ width: 1200, height: 630 });
});
