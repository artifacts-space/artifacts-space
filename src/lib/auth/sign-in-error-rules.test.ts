import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./sign-in-error-rules";

describe("signInErrorMessage", () => {
  it.each(["google_email_not_verified", "google_email_not_authoritative", "account_not_linked"])(
    "should say the same neutral sentence when the sign-in was refused with %s, so it never reveals whether an account exists",
    (code) => {
      expect(signInErrorMessage(code)).toBe("We could not sign you in with that account. Use an email link to your address instead.");
    },
  );

  it("should show its own fallback, never the link's text, when the code is unknown", () => {
    expect(signInErrorMessage("<script>Call 555-0100 to restore your account</script>")).toBe("Sign-in did not finish. Try again, or use an email link.");
  });

  it.each(["__proto__", "toString", "constructor", "valueOf", "hasOwnProperty"])("should show the fallback text when the code %s names an inherited object member", (code) => {
    expect(signInErrorMessage(code)).toBe("Sign-in did not finish. Try again, or use an email link.");
  });

  it("should show nothing when there is no error code", () => {
    expect(signInErrorMessage(null)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });
});
