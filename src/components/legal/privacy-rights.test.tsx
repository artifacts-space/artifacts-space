import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
});
