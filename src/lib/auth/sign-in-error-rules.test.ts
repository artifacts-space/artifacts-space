import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./sign-in-error-rules";

describe("signInErrorMessage", () => {
  it("should say Google has not verified the address when Google sign-in was refused for it", () => {
    expect(signInErrorMessage("google_email_not_verified")).toMatch(/^Google has not verified this email address/);
  });

  it("should point to an email link when the sign-in could not join an existing account", () => {
    expect(signInErrorMessage("account_not_linked")).toMatch(/already has an account.*Use an email link instead\.$/);
  });

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
