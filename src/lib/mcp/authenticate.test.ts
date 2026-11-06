import { describe, expect, it } from "vitest";

import { bearerToken } from "./authenticate";

describe("bearerToken", () => {
  it("should read the token when the header uses the Bearer scheme in any case", () => {
    expect(bearerToken("Bearer artifacts_abc")).toBe("artifacts_abc");
    expect(bearerToken("bearer   artifacts_oat_x ")).toBe("artifacts_oat_x");
  });

  it("should return null when there is no bearer token", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
  });
});
