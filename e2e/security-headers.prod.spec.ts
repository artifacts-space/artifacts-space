import { expect, test } from "@playwright/test";

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
    expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
  });
}
