import { describe, expect, it } from "vitest";

import { forbiddenSocialField } from "./social-request-rules";

describe("forbiddenSocialField", () => {
  it("should allow a start request when it names only the provider and where to go", () => {
    expect(forbiddenSocialField({ provider: "google", callbackURL: "/app", errorCallbackURL: "/sign-in" })).toBeNull();
  });

  it("should refuse a start request when it asks for its own scopes", () => {
    expect(forbiddenSocialField({ provider: "google", scopes: ["https://www.googleapis.com/auth/drive"] })).toBe("scopes");
    expect(forbiddenSocialField({ provider: "google", scopes: [] })).toBe("scopes");
  });

  it("should refuse a start request when it adds its own authorization parameters", () => {
    expect(forbiddenSocialField({ provider: "google", additionalParams: { access_type: "offline" } })).toBe("additionalParams");
  });

  it("should allow a request when it has no body", () => {
    expect(forbiddenSocialField(undefined)).toBeNull();
    expect(forbiddenSocialField(null)).toBeNull();
  });
});
