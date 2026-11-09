import { expect, test } from "@playwright/test";

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

test("should serve the sitemap from the cache instead of building it per request", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  // HIT or STALE: served from the prerendered cache. A per-request route sends no x-nextjs-cache header.
  // `next start` sends no s-maxage for this route (on Vercel the prerender's expiry drives the CDN), so this is the signal.
  const cacheState = response.headers()["x-nextjs-cache"] ?? "no x-nextjs-cache header (built per request)";
  expect(cacheState, `x-nextjs-cache was ${cacheState}`).toMatch(/^(HIT|STALE)$/);
});
