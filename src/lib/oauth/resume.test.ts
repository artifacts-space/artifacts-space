import { describe, expect, it } from "vitest";

import { authorizeResumePath, oauthSignInPath, searchFromParams } from "./resume";

const signed = "client_id=c&scope=artifacts%3Aread&prompt=login+consent&exp=1&ba_iat=2&ba_param=client_id&ba_param=scope&sig=abc";

describe("authorizeResumePath", () => {
  it("should rebuild the authorization request without the signature parameters", () => {
    const path = authorizeResumePath(signed);
    const params = new URL(path, "https://artifacts.space").searchParams;
    expect(path.startsWith("/api/auth/oauth2/authorize?")).toBe(true);
    expect(params.get("client_id")).toBe("c");
    expect(params.get("scope")).toBe("artifacts:read");
    for (const name of ["sig", "exp", "ba_iat", "ba_param", "ba_pl"]) expect(params.has(name)).toBe(false);
  });

  it("should drop a login prompt when the person has just signed in", () => {
    const params = new URL(authorizeResumePath(signed), "https://artifacts.space").searchParams;
    expect(params.get("prompt")).toBe("consent");
    expect(new URL(authorizeResumePath("client_id=c&prompt=login"), "https://artifacts.space").searchParams.has("prompt")).toBe(false);
  });
});

describe("oauthSignInPath", () => {
  it("should send the person to sign-in with the authorization request as next", () => {
    const url = new URL(oauthSignInPath("client_id=c&sig=x"), "https://artifacts.space");
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("next")).toBe("/api/auth/oauth2/authorize?client_id=c");
  });
});

describe("searchFromParams", () => {
  it("should keep repeated keys when rebuilding a query string", () => {
    expect(searchFromParams({ a: "1", b: ["2", "3"], c: undefined })).toBe("a=1&b=2&b=3");
  });
});
