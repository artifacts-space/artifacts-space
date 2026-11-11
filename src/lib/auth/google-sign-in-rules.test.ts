import { describe, expect, it } from "vitest";

import {
  googleCredentials,
  googleIdentityProblem,
  isGoogleAuthoritativeEmail,
  isGoogleEmailVerified,
  isGoogleSignInEnabled,
  isRealCredential,
  nonAuthoritativeGoogleEmail,
  unverifiedGoogleEmail,
} from "./google-sign-in-rules";

const real = { GOOGLE_CLIENT_ID: "1234-abc.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "GOCSPX-test-only" };

describe("isRealCredential", () => {
  it("should accept a value when it is set and not a placeholder", () => {
    expect(isRealCredential("1234-abc.apps.googleusercontent.com")).toBe(true);
  });

  it.each([undefined, "", "   ", "replace-with-google-client-id", "replace-with-google-client-secret", " Replace-With-anything "])(
    "should refuse %j when it is missing, blank, or a placeholder",
    (value) => {
      expect(isRealCredential(value)).toBe(false);
    },
  );
});

describe("googleCredentials", () => {
  it("should return trimmed credentials when both values are real", () => {
    expect(googleCredentials({ GOOGLE_CLIENT_ID: ` ${real.GOOGLE_CLIENT_ID}\n`, GOOGLE_CLIENT_SECRET: real.GOOGLE_CLIENT_SECRET })).toEqual({
      clientId: real.GOOGLE_CLIENT_ID,
      clientSecret: real.GOOGLE_CLIENT_SECRET,
    });
  });

  it("should be off when neither value is set", () => {
    expect(googleCredentials({})).toBeNull();
  });

  it("should be off when only the client id is real", () => {
    expect(googleCredentials({ GOOGLE_CLIENT_ID: real.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: "replace-with-google-client-secret" })).toBeNull();
    expect(googleCredentials({ GOOGLE_CLIENT_ID: real.GOOGLE_CLIENT_ID })).toBeNull();
  });

  it("should be off when only the secret is real", () => {
    expect(googleCredentials({ GOOGLE_CLIENT_ID: "replace-with-google-client-id", GOOGLE_CLIENT_SECRET: real.GOOGLE_CLIENT_SECRET })).toBeNull();
    expect(googleCredentials({ GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: real.GOOGLE_CLIENT_SECRET })).toBeNull();
  });

  it("should be off on a Vercel preview when both values are real", () => {
    expect(googleCredentials({ ...real, VERCEL_ENV: "preview" })).toBeNull();
  });

  it("should be on in production and in local development when both values are real", () => {
    expect(googleCredentials({ ...real, VERCEL_ENV: "production" })).not.toBeNull();
    expect(googleCredentials({ ...real, VERCEL_ENV: "development" })).not.toBeNull();
  });
});

describe("isGoogleSignInEnabled", () => {
  it("should show the button only when the server would configure Google", () => {
    expect(isGoogleSignInEnabled(real)).toBe(true);
    expect(isGoogleSignInEnabled({ GOOGLE_CLIENT_ID: "replace-with-google-client-id", GOOGLE_CLIENT_SECRET: "replace-with-google-client-secret" })).toBe(false);
    expect(isGoogleSignInEnabled({ ...real, VERCEL_ENV: "preview" })).toBe(false);
  });
});

describe("isGoogleEmailVerified", () => {
  it("should be verified when Google says email_verified is true", () => {
    expect(isGoogleEmailVerified({ email_verified: true })).toBe(true);
    expect(isGoogleEmailVerified({ email_verified: "true" })).toBe(true);
  });

  it.each([{ email_verified: false }, { email_verified: "false" }, { email_verified: 1 }, {}, undefined])("should be unverified when the profile is %j", (profile) => {
    expect(isGoogleEmailVerified(profile)).toBe(false);
  });
});

describe("isGoogleAuthoritativeEmail", () => {
  it.each([
    { email: "sam@gmail.com" },
    { email: "Sam@GoogleMail.com" },
    { email: "sam@corp.example", hd: "corp.example" },
    { email: "sam@Corp.Example", hd: "corp.example" },
  ])("should trust Google for %j when Google hosts the mailbox", (profile) => {
    expect(isGoogleAuthoritativeEmail(profile)).toBe(true);
  });

  it.each([
    { email: "sam@corp.example" },
    { email: "sam@corp.example", hd: "other.example" },
    { email: "sam@sub.corp.example", hd: "corp.example" },
    { email: "sam@gmail.com.evil.example" },
    { email: "not-an-address" },
    { email: "@gmail.com" },
    {},
    undefined,
  ])("should not trust Google for %j when Google does not host the mailbox", (profile) => {
    expect(isGoogleAuthoritativeEmail(profile)).toBe(false);
  });
});

describe("googleIdentityProblem", () => {
  const google = (profile: Record<string, unknown> | undefined, action?: string) => ({ source: { method: "oauth", action, oauth: { providerId: "google", profile } } });
  const outsideAddress = { email: "sam@corp.example", email_verified: true };

  it("should refuse a Google identity when Google has not verified the email", () => {
    for (const action of ["create-user", "link-account", "sign-in"]) {
      expect(googleIdentityProblem(google({ email: "sam@gmail.com", email_verified: false }, action)), action).toEqual(unverifiedGoogleEmail);
    }
  });

  it("should refuse a Google identity when the profile is missing", () => {
    expect(googleIdentityProblem(google(undefined, "create-user"))).toEqual(unverifiedGoogleEmail);
  });

  it("should allow a Google identity when Google verified an address it hosts", () => {
    expect(googleIdentityProblem(google({ email: "sam@gmail.com", email_verified: true }, "create-user"))).toBeUndefined();
    expect(googleIdentityProblem(google({ email: "sam@corp.example", hd: "corp.example", email_verified: true }, "link-account"))).toBeUndefined();
  });

  it("should refuse a verified outside address when it would create or join an account", () => {
    expect(googleIdentityProblem(google(outsideAddress, "create-user"))).toEqual(nonAuthoritativeGoogleEmail);
    expect(googleIdentityProblem(google(outsideAddress, "link-account"))).toEqual(nonAuthoritativeGoogleEmail);
    expect(googleIdentityProblem(google(outsideAddress))).toEqual(nonAuthoritativeGoogleEmail);
  });

  it("should let an already linked Google account sign in again when its verified address is outside Google", () => {
    expect(googleIdentityProblem(google(outsideAddress, "sign-in"))).toBeUndefined();
  });

  it("should leave GitHub and magic links alone when they carry no Google claim", () => {
    expect(googleIdentityProblem({ source: { method: "oauth", action: "link-account", oauth: { providerId: "github", profile: { login: "sam" } } } })).toBeUndefined();
    expect(googleIdentityProblem({ source: { method: "magic-link", action: "create-user" } })).toBeUndefined();
  });
});
