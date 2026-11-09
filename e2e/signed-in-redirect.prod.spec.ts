import { expect, test } from "@playwright/test";

/*
 * Signed-in visitors skip the landing and sign-in pages (src/proxy.ts and
 * src/lib/auth/entry-rules.ts), on the production build with no database.
 * The session cookie here is forged, so Better Auth rejects its signature:
 * to the server it is exactly a stale cookie. Cookie presence alone sends
 * `/` to the workspace; the workspace's real check must then end the trip on
 * the sign-in page and expire the cookie, with no loop.
 */

/**
 * The test server's site URL is http://localhost, so Better Auth uses the plain
 * cookie name; on HTTPS it is `__Secure-better-auth.session_token` (both are
 * covered in src/proxy.test.ts).
 */
const sessionCookieName = "better-auth.session_token";
const staleCookie = `${sessionCookieName}=forged.signature`;
const crawler = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

test("should redirect a visitor with a session cookie from / to the workspace, uncached", async ({ request }) => {
  const response = await request.get("/", { headers: { cookie: staleCookie }, maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location ?? "", "http://localhost").pathname).toBe("/app");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
});

test("should serve the landing page to a signed-in visitor when the URL is /?home", async ({ request }) => {
  const response = await request.get("/?home", { headers: { cookie: staleCookie }, maxRedirects: 0 });
  expect(response.status()).toBe(200);
});

test("should give a crawler the static landing page with its cacheable headers", async ({ request }) => {
  const crawled = await request.get("/", { headers: { "user-agent": crawler }, maxRedirects: 0 });
  expect(crawled.status()).toBe(200);
  const headers = crawled.headers();
  expect(headers["cache-control"]).not.toMatch(/private|no-store/);
  expect(headers["set-cookie"]).toBeUndefined();
  expect(await crawled.text()).toContain("The collaboration space for humans and agents.");
  // A plain signed-out visitor gets the very same caching.
  const visitor = await request.get("/", { maxRedirects: 0 });
  expect(visitor.headers()["cache-control"]).toBe(headers["cache-control"]);
});

test("should serve the sign-in page cacheable when there is no session cookie", async ({ request }) => {
  const response = await request.get("/sign-in", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).not.toMatch(/private|no-store/);
});

test("should end a stale cookie on the sign-in page and then show the landing page, with no loop", async ({ page, context }) => {
  await context.addCookies([{ name: sessionCookieName, value: "forged.signature", domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const hops: string[] = [];
  page.on("response", (response) => {
    if (response.request().isNavigationRequest()) hops.push(`${String(response.status())} ${new URL(response.url()).pathname}`);
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp$/);
  expect(hops).toEqual(["307 /", "307 /app", "200 /sign-in"]);
  expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(sessionCookieName);

  // The cookie is gone, so / is the landing page again.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "The collaboration space for humans and agents." })).toBeVisible();
});
