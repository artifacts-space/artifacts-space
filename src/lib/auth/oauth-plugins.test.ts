import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimits } from "@/lib/abuse/limits";

import { oauthPlugins } from "./oauth-plugins";

/*
 * Better Auth's OAuth provider brings its own in-memory limits, per server
 * instance and per address: 20 token requests and 5 registrations a minute
 * by default. A hosted app sends all its users' refreshes from a few shared
 * addresses, so those defaults would throttle it before the Postgres limits
 * (src/lib/abuse/limits.ts) ever decide. They must stay far above them.
 */

function ruleFor(path: string) {
  const [provider] = oauthPlugins();
  const rule = provider.rateLimit.find((candidate) => candidate.pathMatcher(path));
  if (!rule) throw new Error(`no rule for ${path}`);
  return { perHour: (rule.max * 3600) / rule.window, max: rule.max, window: rule.window };
}

describe("Better Auth's own OAuth endpoint limits", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should let one instance take far more token requests from one address than the hourly backstop when a hosted app bursts", () => {
    expect(ruleFor("/oauth2/token").perHour).toBeGreaterThanOrEqual(10 * rateLimits.oauthToken.limit);
    expect(ruleFor("/oauth2/token").max).toBeGreaterThanOrEqual(1000);
  });

  it("should let one instance take more registrations from one address than the hourly limit when a hosted app bursts", () => {
    expect(ruleFor("/oauth2/register").perHour).toBeGreaterThanOrEqual(rateLimits.oauthRegister.limit);
    expect(ruleFor("/oauth2/register").max).toBeGreaterThanOrEqual(100);
  });

  it("should keep Better Auth's default limit on authorization requests, which come from the person's own browser", () => {
    expect(ruleFor("/oauth2/authorize")).toMatchObject({ max: 30, window: 60 });
  });
});
