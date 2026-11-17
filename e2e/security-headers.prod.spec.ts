import { mintPageToken } from "../src/lib/page-files/token";

import { localDatabaseEnabled } from "./support/local-db";
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

/*
 * Page files (src/lib/page-files): a page with files of its own loads under
 * `/f/<token>/`. The token here is a real one, made with the secret this
 * production server is started with (playwright.config.ts), for an artifact
 * that does not exist.
 */
const pageFilesSecret = "e2e-only-secret-not-used-anywhere-else-0123456789";
const pageFilesToken = (label = pageHostLabel) => mintPageToken({ artifactId: "no-such-artifact", label, asOf: null, stamp: 0 }, new Date(), pageFilesSecret).token;

test("should let the page load files from its own host, and nothing else new, in the frame document's policy", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const response = await request.get("/", { headers: { host: `${pageHostLabel}.localhost:${site.port}` } });
  const directives = (response.headers()["content-security-policy"] ?? "").split("; ");
  const sources = (name: string) => directives.find((directive) => directive.startsWith(`${name} `))?.split(" ").slice(1) ?? [];
  for (const name of ["script-src", "style-src", "font-src", "img-src", "media-src", "connect-src", "worker-src"]) expect(sources(name), name).toContain("'self'");
  for (const name of ["frame-src", "object-src", "base-uri", "form-action"]) expect(sources(name), name).toEqual(["'none'"]);
  expect(sources("connect-src").join(" ")).not.toContain(site.host);
});

test("should serve the same frame document as the page's name under a files address", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const host = `${pageHostLabel}.localhost:${site.port}`;
  const root = await request.get("/", { headers: { host } });
  const named = await request.get(`/f/${pageFilesToken()}/index.html`, { headers: { host }, maxRedirects: 0 });
  expect(named.status()).toBe(200);
  expect(await named.text()).toBe(await root.text());
  expect(named.headers()["content-security-policy"]).toBe(root.headers()["content-security-policy"]);
  expect(named.headers()["set-cookie"]).toBeUndefined();
});

test("should hand a page file's address to its route on a page host, which serves nothing it cannot find", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const response = await request.get(`/f/${pageFilesToken()}/css/site.css`, { headers: { host: `${pageHostLabel}.localhost:${site.port}` }, maxRedirects: 0 });
  // The route ran: with a database it finds no such artifact (404); without one (CI) it cannot look, and says only that it failed (500). The refusal page never answers 500.
  expect(response.status()).toBe(localDatabaseEnabled() ? 404 : 500);
  expect(["Not found", "The file could not be loaded. Try again."]).toContain(await response.text());
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(response.headers().location).toBeUndefined();
  expect(response.headers()["cache-control"]).toBe("no-store");
});

test("should answer 404 for a page file's address whose token it cannot open, before any lookup", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const host = `${pageHostLabel}.localhost:${site.port}`;
  const otherLabel = "fedcba9876543210fedcba9876543210";
  for (const token of ["A".repeat(120), pageFilesToken(otherLabel), mintPageToken({ artifactId: "no-such-artifact", label: pageHostLabel, asOf: null, stamp: 0 }, new Date(Date.now() - 60 * 60_000), pageFilesSecret).token]) {
    const response = await request.get(`/f/${token}/css/site.css`, { headers: { host }, maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("Not found");
  }
});

test("should answer 404 for a page file's address on every host but a page host, and 405 for a write", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const path = `/f/${pageFilesToken()}/css/site.css`;
  for (const host of [site.host, `www.localhost:${site.port}`, `${pageHostLabel}.x.localhost:${site.port}`, `${pageHostLabel}.example.com`]) {
    for (const target of [path, `/f/${pageFilesToken()}/index.html`]) {
      const response = await request.get(target, { headers: { host }, maxRedirects: 0 });
      expect(response.status(), `${host} ${target.slice(-10)}`).toBe(404);
      expect(response.headers()["set-cookie"]).toBeUndefined();
    }
  }
  const write = await request.post(path, { headers: { host: `${pageHostLabel}.localhost:${site.port}` }, data: "x", maxRedirects: 0 });
  expect(write.status()).toBe(405);
});

test("should serve nothing at a files address that ends with a slash: it is sent to the same address without it, which is a 404", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const host = `${pageHostLabel}.localhost:${site.port}`;
  const address = `/f/${pageFilesToken()}`;
  // Next answers a trailing slash itself, before the proxy; this is why the page's own name is index.html and not the folder.
  const slash = await request.get(`${address}/`, { headers: { host }, maxRedirects: 0 });
  expect(slash.status()).toBe(308);
  expect(slash.headers().location).toBe(address);
  expect(slash.headers()["set-cookie"]).toBeUndefined();
  const bare = await request.get(address, { headers: { host }, maxRedirects: 0 });
  expect(bare.status()).toBe(404);
  expect(await bare.text()).toBe("Not found");
});

for (const path of ["/preview", "/docs", "/sign-in", "/api/auth/get-session", "/mcp", "/llms.txt", "/_next/static/chunks/none.js", "/f", "/f/short/site.css", `/f/${"A".repeat(120)}`]) {
  test(`should answer 404 for ${path} on a page host`, async ({ request, baseURL }) => {
    const site = new URL(baseURL ?? "");
    const response = await request.get(path, { headers: { host: `${pageHostLabel}.localhost:${site.port}` }, maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(response.headers()["content-security-policy"]).toBe("default-src 'none'; sandbox; frame-ancestors 'none'");
  });
}

// A wildcard domain sends every host under the page domain to the app. Only page hosts get an answer there.
for (const name of ["www", "app", "WWW", `${pageHostLabel}.x`]) {
  for (const path of ["/", "/preview", "/docs", "/sign-in", "/app", "/api/auth/get-session", "/api/mcp", "/robots.txt", "/llms.txt", "/_next/static/chunks/none.js"]) {
    test(`should answer 404 for ${path} on ${name}.<page domain>, which is no page host`, async ({ request, baseURL }) => {
      const site = new URL(baseURL ?? "");
      const response = await request.get(path, { headers: { host: `${name}.localhost:${site.port}` }, maxRedirects: 0 });
      expect(response.status()).toBe(404);
      expect(await response.text()).toBe("Not found");
      expect(response.headers()["set-cookie"]).toBeUndefined();
    });
  }
}

test("should answer 404 on a host under the page domain that ends with a dot", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  for (const path of ["/", "/preview", "/sign-in"]) {
    const response = await request.get(path, { headers: { host: `www.localhost.:${site.port}` }, maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});

test("should answer 404 for a POST to a host under the page domain that is no page host", async ({ request, baseURL }) => {
  const site = new URL(baseURL ?? "");
  const response = await request.post("/api/auth/sign-in/email", { headers: { host: `www.localhost:${site.port}` }, data: { email: "someone@example.com", password: "x" }, maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(response.headers()["set-cookie"]).toBeUndefined();
});

test("should still serve the site on its own host", async ({ request }) => {
  const response = await request.get("/preview");
  expect(response.status()).toBe(200);
});

test("should answer 404 for a host that looks like a page host on another domain", async ({ request }) => {
  const response = await request.get("/", { headers: { host: `${pageHostLabel}.example.com` }, maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
