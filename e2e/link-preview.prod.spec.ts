import { expect, test, type APIRequestContext } from "@playwright/test";

/*
 * Link previews as Slack sees them, on the production build with no database
 * (as in CI). Next merges a page's openGraph and twitter tags with the root's
 * file-based opengraph-image and twitter-image, and Slackbot gets blocking
 * metadata in <head>, so only the built HTML shows what a crawler reads.
 * Every page that cannot show an artifact preview must still carry the site
 * image and the brand icons, and never the Next.js default favicon.
 */

const slackbot = { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" };

/** The content of the first <meta> tag in <head> whose property or name is `key`, or null. */
function headMeta(html: string, key: string): string | null {
  const head = html.split("</head>")[0] ?? "";
  const tag = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(head);
  return tag?.[1] ?? null;
}

/** The href of the first <link rel="…"> in <head> with this rel, or null. */
function headLink(html: string, rel: string, type?: string): string | null {
  const head = html.split("</head>")[0] ?? "";
  for (const tag of head.match(/<link [^>]*>/g) ?? []) {
    if (!tag.includes(`rel="${rel}"`) || (type && !tag.includes(`type="${type}"`))) continue;
    return /href="([^"]*)"/.exec(tag)?.[1] ?? null;
  }
  return null;
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

/** Fetches an image URL from a tag as Slack would, on this server, and returns its size. */
async function fetchPng(request: APIRequestContext, url: string) {
  const response = await request.get(new URL(url).pathname + new URL(url).search, { headers: slackbot });
  expect(response.status(), url).toBe(200);
  expect(response.headers()["content-type"], url).toBe("image/png");
  return pngSize(await response.body());
}

async function page(request: APIRequestContext, path: string) {
  const response = await request.get(path, { headers: slackbot, failOnStatusCode: false });
  return { status: response.status(), html: await response.text() };
}

const previewPages = [
  { name: "the home page", path: "/" },
  // Not a valid public id, so the read check answers 404 without a database, as for any private, team, or missing artifact.
  { name: "an artifact a signed-out reader cannot open", path: "/artifact/not-a-real-id" },
];

for (const { name, path } of previewPages) {
  test(`should give Slack the site title, description, and 1200x630 image when it unfurls ${name}`, async ({ request }) => {
    const { html } = await page(request, path);
    expect(headMeta(html, "og:title")).toBe("artifacts.space");
    expect(headMeta(html, "og:description")).toContain("The collaboration space for humans and agents");
    for (const key of ["og:image", "twitter:image"]) {
      const url = headMeta(html, key);
      expect(url, key).toBeTruthy();
      expect(await fetchPng(request, url ?? ""), key).toEqual({ width: 1200, height: 630 });
    }
  });

  test(`should link the brand favicon and Apple touch icon when Slack unfurls ${name}`, async ({ request }) => {
    const { html } = await page(request, path);
    expect(headLink(html, "icon", "image/x-icon")).toMatch(/^\/favicon\.ico/);
    const apple = headLink(html, "apple-touch-icon");
    expect(apple).toMatch(/^\/apple-icon\.png/);
    expect(await fetchPng(request, `http://localhost${apple ?? ""}`)).toEqual({ width: 180, height: 180 });
  });
}

test("should serve a 16, 32, and 48 pixel brand favicon, not the Next.js default", async ({ request }) => {
  const response = await request.get("/favicon.ico", { headers: slackbot });
  expect(response.status()).toBe(200);
  const body = await response.body();
  expect(body.readUInt16LE(2)).toBe(1);
  const sizes = Array.from({ length: body.readUInt16LE(4) }, (_, i) => body[6 + i * 16]);
  expect(sizes.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([16, 32, 48]);
  // create-next-app's default is a black and white "N" of the same sizes; the brand planet is blue.
  expect(bluePixels(body)).toBeGreaterThan(100);
});

/** Pixels in the ICO's first image (a 32-bit BMP entry) whose blue channel clearly beats red. */
function bluePixels(ico: Buffer): number {
  const offset = ico.readUInt32LE(18);
  const width = ico[6] ?? 0;
  const pixels = offset + ico.readUInt32LE(offset);
  let blue = 0;
  for (let i = 0; i < width * width; i++) {
    const b = ico[pixels + i * 4] ?? 0;
    const r = ico[pixels + i * 4 + 2] ?? 0;
    if (b - r > 60) blue++;
  }
  return blue;
}

test("should answer an unknown artifact's preview image with the site image", async ({ request }) => {
  const response = await request.get("/artifact/not-a-real-id/og/00000000-0000-0000-0000-000000000000.AAAAAAAAAA", { headers: slackbot });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(pngSize(await response.body())).toEqual({ width: 1200, height: 630 });
});
