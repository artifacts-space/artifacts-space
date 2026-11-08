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
