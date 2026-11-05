import { describe, expect, it } from "vitest";

import { devUser, isDevSignInEnabled } from "./dev-user";

describe("dev user", () => {
  it("should use a reserved artifacts.space address when signing in locally", () => {
    expect(devUser.email).toBe("dev@artifacts.space");
  });

  it("should disable dev sign-in when not running under next dev", () => {
    expect(isDevSignInEnabled).toBe(process.env.NODE_ENV === "development");
  });
});
