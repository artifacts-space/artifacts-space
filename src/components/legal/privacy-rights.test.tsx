import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { rateLimitRetentionDays } from "@/lib/abuse/limits";
import { sessionConfig, sessionLifetimeSeconds } from "@/lib/auth/session-config";

import { PrivacyRights } from "./privacy-rights";

const day = 86_400;

describe("PrivacyRights retention", () => {
  const html = renderToStaticMarkup(<PrivacyRights />);

  it("should state the session length the auth setting uses when rendered", () => {
    expect(sessionConfig.expiresIn).toBe(sessionLifetimeSeconds);
    expect(sessionLifetimeSeconds % day).toBe(0);
    expect(html).toContain(`a session ends when you sign out or ${String(sessionLifetimeSeconds / day)} days after you last use it.`);
  });

  it("should never state a session length other than the setting when rendered", () => {
    const stated = [...html.matchAll(/session ends when you sign out or (\d+) days/g)].map((match) => Number(match[1]));
    expect(stated).toEqual([sessionLifetimeSeconds / day]);
  });

  it("should state how long rate-limit counters are kept from the cleanup's own number when rendered", () => {
    expect(html).toContain(`<strong>Rate-limit counters:</strong> deleted after ${String(rateLimitRetentionDays)} days.`);
  });

  it("should never promise rate-limit counters go within a day when they are kept longer", () => {
    expect(rateLimitRetentionDays).toBeGreaterThan(1);
    expect(html).not.toMatch(/Rate-limit counters:<\/strong>[^<]*within a day/);
  });
});
