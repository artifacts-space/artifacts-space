import { describe, expect, it } from "vitest";

import { docsPages } from "@/lib/docs/pages";

import { crawlDisallowed, crawlOrigin, publicPaths, robotsFor, securityTxtExpires, securityTxtFor, sitemapFor } from "./crawl-rules";

const origin = "https://artifacts.space";
const privatePrefixes = ["/artifact", "/share", "/app", "/api", "/oauth", "/teams", "/inbox", "/threads", "/invitations", "/dev", "/preview"];

describe("sitemapFor", () => {
  it("should never list artifacts, shares, or app routes when no artifact is opted in", () => {
    for (const { url } of sitemapFor(origin)) {
      const { pathname } = new URL(url);
      for (const prefix of privatePrefixes) expect(pathname === prefix || pathname.startsWith(`${prefix}/`)).toBe(false);
    }
  });

  it("should list the home page, legal pages, and every docs page when the sitemap is built", () => {
    const urls = sitemapFor(origin).map((entry) => entry.url);
    expect(urls).toContain(`${origin}/`);
    expect(urls).toContain(`${origin}/privacy`);
    expect(urls).toContain(`${origin}/terms`);
    expect(urls).toContain(`${origin}/docs`);
    expect(urls).toContain(`${origin}/docs/quickstart`);
    expect(urls).toHaveLength(3 + docsPages.length);
  });

  it("should add only the artifact pages it is given after the site's pages when artifacts are opted in", () => {
    const urls = sitemapFor(origin, ["/artifact/4fXkP9qR2sT7vW1yZ3aB5c"]).map((entry) => entry.url);
    expect(urls).toHaveLength(publicPaths().length + 1);
    expect(urls.at(-1)).toBe(`${origin}/artifact/4fXkP9qR2sT7vW1yZ3aB5c`);
  });

  it("should use only the given origin when URLs are built", () => {
    for (const { url } of sitemapFor(origin)) expect(new URL(url).origin).toBe(origin);
  });
});

describe("robotsFor", () => {
  it("should disallow the app, API, OAuth, and team routes when robots.txt is built", () => {
    const robots = robotsFor(origin);
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    const disallow = rules.flatMap((rule) => rule.disallow ?? []);
    for (const path of ["/app", "/api/", "/oauth/", "/teams", "/inbox", "/threads", "/invitations", "/dev/", "/preview"]) {
      expect(disallow).toContain(path);
    }
    expect(robots.sitemap).toBe(`${origin}/sitemap.xml`);
  });

  it("should not block any sitemap page when robots.txt is built", () => {
    for (const path of publicPaths()) {
      expect(crawlDisallowed.some((prefix) => path.startsWith(prefix))).toBe(false);
    }
  });
});

describe("securityTxtFor", () => {
  it("should carry every RFC 9116 field the site promises when security.txt is served", () => {
    const body = securityTxtFor(origin);
    expect(body).toContain("Contact: https://github.com/artifacts-space/artifacts-space/security/advisories/new\n");
    expect(body).toContain(`Expires: ${securityTxtExpires.toISOString()}\n`);
    expect(body).toContain("Policy: https://github.com/artifacts-space/artifacts-space/blob/main/SECURITY.md\n");
    expect(body).toContain(`Canonical: ${origin}/.well-known/security.txt\n`);
    expect(body).toContain("Preferred-Languages: en\n");
  });

  it("should list the security email first and the GitHub advisory form second when security.txt is served", () => {
    const contacts = securityTxtFor(origin).split("\n").filter((line) => line.startsWith("Contact: "));
    expect(contacts).toEqual([
      "Contact: mailto:security@artifacts.space",
      "Contact: https://github.com/artifacts-space/artifacts-space/security/advisories/new",
    ]);
  });

  it("should fail 30 days before Expires when nobody has renewed security.txt", () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    // Renew: confirm the contact still works, then move securityTxtExpires about a year ahead.
    expect(securityTxtExpires.getTime() - Date.now()).toBeGreaterThan(thirtyDays);
  });

  it("should keep Expires under the RFC's one-year limit when it is renewed", () => {
    const oneYearAndAMonth = 396 * 24 * 60 * 60 * 1000;
    expect(securityTxtExpires.getTime() - Date.now()).toBeLessThan(oneYearAndAMonth);
  });
});

describe("crawlOrigin", () => {
  it("should use the configured origin when BETTER_AUTH_URL is set", () => {
    expect(crawlOrigin({ NODE_ENV: "production", BETTER_AUTH_URL: "https://example.com/api" })).toBe("https://example.com");
  });

  it("should fall back instead of failing the build when no origin is set", () => {
    expect(crawlOrigin({ NODE_ENV: "production" })).toBe("http://localhost:3000");
  });
});

describe("the unlisted reviewer sign-in page", () => {
  it("should appear nowhere in the sitemap or robots.txt, so no crawler is pointed at it", () => {
    const origin = "https://artifacts.space";
    expect(JSON.stringify(sitemapFor(origin))).not.toContain("reviewer");
    expect(JSON.stringify(robotsFor(origin))).not.toContain("reviewer");
    expect(publicPaths()).not.toContain("/sign-in/reviewer");
  });
});
