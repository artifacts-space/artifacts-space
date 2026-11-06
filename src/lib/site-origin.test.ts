import { describe, expect, it } from "vitest";

import { siteOrigin, siteUrl } from "./site-origin";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("siteOrigin", () => {
  it("should use BETTER_AUTH_URL when it is set", () => {
    expect(siteOrigin(env({ BETTER_AUTH_URL: "https://artifacts.space/", VERCEL_PROJECT_PRODUCTION_URL: "other.example", NODE_ENV: "production" }))).toBe("https://artifacts.space");
  });

  it("should use the Vercel production domain when BETTER_AUTH_URL is unset", () => {
    expect(siteOrigin(env({ VERCEL_PROJECT_PRODUCTION_URL: "artifacts.space", NODE_ENV: "production" }))).toBe("https://artifacts.space");
  });

  it("should fall back to localhost only in development", () => {
    expect(siteOrigin(env({ NODE_ENV: "development" }))).toBe("http://localhost:3000");
  });

  it("should throw when nothing is configured outside development", () => {
    expect(() => siteOrigin(env({ NODE_ENV: "production" }))).toThrow(/BETTER_AUTH_URL/);
    expect(() => siteOrigin(env({ NODE_ENV: "test" }))).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("siteUrl", () => {
  it("should join a path to the site origin", () => {
    expect(siteUrl("/artifact/abc", env({ BETTER_AUTH_URL: "https://artifacts.space" }))).toBe("https://artifacts.space/artifact/abc");
  });
});
