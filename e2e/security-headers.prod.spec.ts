import { expect, test } from "./support/test";

/**
 * The security headers from next.config.ts reach real production responses
 * (the "production" project in playwright.config.ts). The rules themselves
 * are tested in src/lib/security-header-rules.test.ts.
 */

for (const path of ["/", "/preview"]) {
  test(`should forbid framing and send baseline headers when ${path} is served`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const headers = response.headers();
    expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    // Vercel sends HSTS in production; the app never adds a second one.
    expect(headers["strict-transport-security"]).toBeUndefined();
  });
}

/*
 * A page host (src/lib/page-host/rules.ts) in the production build. The test
 * runner cannot look up `<label>.localhost`, so each request goes to the
 * server with the page host's name in the Host header.
 */
const pageHostLabel = "0123456789abcdef0123456789abcdef";

test("should send the frame document with its own policy, and none of the site's framing headers, when a page host's root is served", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const response = await request.get("/", { headers: { host: `${pageHostLabel}.localhost:${site.port}` } });
  expect(response.status()).toBe(200);
  const headers = response.headers();
  const policy = headers["content-security-policy"] ?? "";
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain(`frame-ancestors ${site.origin}`);
  expect(policy).not.toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBeUndefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toBe("public, max-age=3600");
  expect(headers["set-cookie"]).toBeUndefined();
  expect(await response.text()).toContain("artifact-page:ready");
});

for (const path of ["/preview", "/docs", "/sign-in", "/api/auth/get-session", "/mcp", "/_next/static/chunks/none.js"]) {
  test(`should answer 404 for ${path} on a page host`, async ({ request, baseURL }) => {
    const site = new URL(baseURL ?? "");
    const response = await request.get(path, { headers: { host: `${pageHostLabel}.localhost:${site.port}` }, maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(response.headers()["content-security-policy"]).toBe("default-src 'none'; sandbox; frame-ancestors 'none'");
  });
}

test("should answer 404 for a host that looks like a page host on another domain", async ({ request }) => {
  const response = await request.get("/", { headers: { host: `${pageHostLabel}.example.com` }, maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
