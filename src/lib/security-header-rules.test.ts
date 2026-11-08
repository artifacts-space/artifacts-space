import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";

import { permissionsPolicy, rawContentPolicy, securityHeaderRules, strictTransportSecurity } from "./security-header-rules";

/** The headers a path ends up with, as Next applies the rules: every match, later rules win per header. */
function headersFor(pathname: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rule of securityHeaderRules()) {
    if (!getPathMatch(rule.source)(pathname)) continue;
    for (const { key, value } of rule.headers) result.set(key.toLowerCase(), value);
  }
  return result;
}

const appPages = ["/", "/oauth/consent", "/oauth/sign-in", "/app", "/app/connections", "/teams/acme", "/inbox", "/artifact/abc123", "/sign-in", "/docs/mcp"];

describe("securityHeaderRules", () => {
  it.each(appPages)("should forbid every site from framing %s when it is served", (pathname) => {
    const headers = headersFor(pathname);
    expect(headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });

  it("should never let another site frame the consent page when any rule is added", () => {
    const headers = headersFor("/oauth/consent");
    expect(headers.get("content-security-policy")).not.toContain("'self'");
    expect(headers.get("content-security-policy")).not.toContain("*");
    expect(headers.get("x-frame-options")).not.toBe("SAMEORIGIN");
  });

  it("should let only this site frame file views when the artifact page shows a PDF", () => {
    const headers = headersFor("/api/files/9f1c2d3e-0000-4000-8000-000000000000");
    expect(headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("should keep the sandbox on raw content when the site-wide policy also matches", () => {
    const policy = headersFor("/artifact/abc123/raw").get("content-security-policy");
    expect(policy).toBe(rawContentPolicy);
    expect(policy).toContain("sandbox");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("should send baseline headers when any page is served", () => {
    const headers = headersFor("/artifact/abc123");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("strict-transport-security")).toBe(strictTransportSecurity);
    expect(headers.get("permissions-policy")).toBe(permissionsPolicy);
  });

  it("should cover every subdomain without joining the preload list when HTTPS is enforced", () => {
    expect(strictTransportSecurity).toContain("max-age=63072000");
    expect(strictTransportSecurity).toContain("includeSubDomains");
    expect(strictTransportSecurity).not.toContain("preload");
  });

  it("should turn off camera, microphone, location, and payments when the site never uses them", () => {
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(permissionsPolicy).toContain(`${feature}=()`);
    }
  });
});
