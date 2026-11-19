import { expect, test } from "./support/test";

/*
 * Search engine headers on the production build, with no database (as in
 * CI). Every check that cannot read the database must fail closed: artifact
 * pages stay noindex and the sitemap lists no artifacts.
 */

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

test("should send noindex, nofollow on an artifact page when its search setting cannot be read", async ({ request }) => {
  const response = await request.get(`/artifact/${publicId}`, { failOnStatusCode: false, maxRedirects: 0 });
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("should keep the sign-in page an unreadable artifact redirects to out of search engines, and leave the plain sign-in page as it was", async ({ request }) => {
  // Not a valid public id, so the read check refuses it without a database (a valid one fails open here, with noindex).
  const landed = await request.get("/artifact/not-a-real-id", { failOnStatusCode: false });
  expect(new URL(landed.url()).pathname).toBe("/sign-in");
  expect(landed.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  for (const path of ["/sign-in?next=%2Fapp", "/sign-up?next=%2Fapp"]) {
    expect((await request.get(path)).headers()["x-robots-tag"], path).toBe("noindex, nofollow");
  }
  expect((await request.get("/sign-in")).headers()["x-robots-tag"]).toBeUndefined();
});

test("should send noindex, nofollow on the Markdown and raw versions of an artifact", async ({ request }) => {
  for (const path of [`/artifact/${publicId}.md`, `/artifact/${publicId}/raw`]) {
    const response = await request.get(path, { failOnStatusCode: false });
    expect(response.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
  }
});

test("should list the site's pages and no artifacts in the sitemap when the database cannot be read", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/docs");
  expect(body).not.toContain("/artifact/");
});

test("should put llms.txt in the sitemap and leave the earlier formats' docs out of it", async ({ request }) => {
  const body = await (await request.get("/sitemap.xml")).text();
  expect(body).toContain("/llms.txt</loc>");
  expect(body).toContain("/docs/formats</loc>");
  expect(body).not.toContain("json-render");
});

test("should allow llms.txt by name in robots.txt, keep one rule for every crawler, and serve llms.txt", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/^Allow: \/llms\.txt$/m);
  expect(robots.match(/^User-Agent:/gim)).toHaveLength(1);
  expect(robots).toMatch(/^Sitemap: \S+\/sitemap\.xml$/m);
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(llms.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(await llms.text()).toContain("## Optional");
});

test("should serve the sitemap from the cache instead of building it per request", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  // HIT or STALE: served from the prerendered cache. A per-request route sends no x-nextjs-cache header.
  // `next start` sends no s-maxage for this route (on Vercel the prerender's expiry drives the CDN), so this is the signal.
  const cacheState = response.headers()["x-nextjs-cache"] ?? "no x-nextjs-cache header (built per request)";
  expect(cacheState, `x-nextjs-cache was ${cacheState}`).toMatch(/^(HIT|STALE)$/);
});
