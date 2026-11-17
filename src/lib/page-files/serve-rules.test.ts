import { describe, expect, it } from "vitest";

import { pageContentPolicy } from "@/lib/page-host/rules";

import { pageFileHeaders, pageFileMaxAge, pageFilePolicy, passedRange } from "./serve-rules";

describe("passedRange", () => {
  it.each(["bytes=0-", "bytes=100-199", "bytes=-500", " bytes=0-1023 "])("should pass on %s", (range) => {
    expect(passedRange(range)).toBe(range.trim());
  });

  it.each([null, "", "bytes=", "bytes=-", "bytes=0-1,5-9", "items=0-1", "bytes=a-b", "bytes=0-1\r\nX-Other: 1", `bytes=${"9".repeat(13)}-`])("should serve the whole file for %j", (range) => {
    expect(passedRange(range)).toBeNull();
  });
});

describe("pageFileHeaders", () => {
  const now = new Date("2026-11-17T12:00:00.000Z");
  const input = { site: "https://artifacts.space", contentType: "text/javascript", body: { status: 200 as const, length: 42, contentRange: null }, expiresAt: new Date("2026-11-17T12:10:30.900Z"), now };

  it("should serve the file as its own type, never sniffed, under the page's own policy", () => {
    const headers = pageFileHeaders(input);
    expect(headers["Content-Type"]).toBe("text/javascript; charset=utf-8");
    expect(headers["Content-Length"]).toBe("42");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors https://artifacts.space");
    expect(headers["Content-Security-Policy"]).toContain("frame-src 'none'");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(headers["Content-Range"]).toBeUndefined();
  });

  it("should sandbox a file that is opened as a document of its own, so no script of it runs outside the site's frame", () => {
    const directives = pageFilePolicy("https://artifacts.space").split("; ");
    expect(directives).toContain("sandbox");
    expect(directives.filter((directive) => directive.startsWith("sandbox"))).toEqual(["sandbox"]);
    expect(pageFilePolicy("https://artifacts.space")).toBe(`${pageContentPolicy("https://artifacts.space")}; sandbox`);
    expect(pageFileHeaders({ ...input, contentType: "image/svg+xml" })["Content-Security-Policy"]).toBe(pageFilePolicy("https://artifacts.space"));
  });

  it("should let only the viewer's browser keep it, and no longer than its address works", () => {
    expect(pageFileHeaders(input)["Cache-Control"]).toBe("private, max-age=630");
    expect(pageFileMaxAge(new Date(now.getTime() + 999), now)).toBe(0);
    expect(pageFileMaxAge(new Date(now.getTime() - 5000), now)).toBe(0);
    expect(pageFileHeaders(input)["Cache-Control"]).not.toContain("public");
  });

  it("should name the part for a Range answer", () => {
    const headers = pageFileHeaders({ ...input, body: { status: 206, length: 100, contentRange: "bytes 100-199/1000" } });
    expect(headers["Content-Range"]).toBe("bytes 100-199/1000");
    expect(headers["Content-Length"]).toBe("100");
    expect(headers["Accept-Ranges"]).toBe("bytes");
  });
});
