import { describe, expect, it } from "vitest";

import { isCronAuthorized } from "./cron-auth";

const secret = "s".repeat(32);

describe("isCronAuthorized", () => {
  it("should accept the bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("should refuse a wrong, missing, or unprefixed secret", () => {
    expect(isCronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronAuthorized(null, secret)).toBe(false);
    expect(isCronAuthorized(secret, secret)).toBe(false);
  });

  it("should refuse everything when the secret is unset or short", () => {
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
});
