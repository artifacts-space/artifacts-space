import { describe, expect, it } from "vitest";

import { routeCheckFor, signInPath } from "./route-status";

describe("routeCheckFor", () => {
  it("should check an artifact page when it is loaded", () => {
    expect(routeCheckFor("GET", "/artifact/abc")).toEqual({ kind: "artifact", publicId: "abc" });
    expect(routeCheckFor("HEAD", "/artifact/abc/")).toEqual({ kind: "artifact", publicId: "abc" });
  });

  it("should check a comment thread page with the artifact read check", () => {
    expect(routeCheckFor("GET", "/threads/abc")).toEqual({ kind: "thread", publicId: "abc" });
    expect(routeCheckFor("POST", "/threads/abc")).toBeNull();
  });

  it("should check a team page when it is loaded", () => {
    expect(routeCheckFor("GET", "/teams/acme")).toEqual({ kind: "team", slug: "acme" });
  });

  it("should pass through the new-team page when the path is reserved", () => {
    expect(routeCheckFor("GET", "/teams/new")).toBeNull();
  });

  it("should pass through server actions when the request is a POST", () => {
    expect(routeCheckFor("POST", "/artifact/abc")).toBeNull();
  });

  it("should pass through other paths when they are not artifact or team pages", () => {
    expect(routeCheckFor("GET", "/teams")).toBeNull();
    expect(routeCheckFor("GET", "/artifact/abc/report")).toBeNull();
  });
});

describe("signInPath", () => {
  it("should return to the page after sign-in when given a path", () => {
    expect(signInPath("/teams/acme")).toBe("/sign-in?next=%2Fteams%2Facme");
  });
});
