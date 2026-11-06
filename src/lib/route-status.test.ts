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

  it("should treat the new-team page as a workspace page when the path is reserved", () => {
    expect(routeCheckFor("GET", "/teams/new")).toEqual({ kind: "workspace" });
  });

  it("should check workspace pages when they have no record to look up", () => {
    for (const path of ["/app", "/app/", "/app/connections", "/inbox", "/teams", "/teams/"]) {
      expect(routeCheckFor("GET", path)).toEqual({ kind: "workspace" });
    }
  });

  it("should pass through paths when they only share a workspace prefix", () => {
    expect(routeCheckFor("GET", "/application")).toBeNull();
    expect(routeCheckFor("GET", "/inbox/old")).toBeNull();
    expect(routeCheckFor("GET", "/teams/acme/settings")).toBeNull();
  });

  it("should pass through server actions when the request is a POST", () => {
    expect(routeCheckFor("POST", "/artifact/abc")).toBeNull();
    expect(routeCheckFor("POST", "/app")).toBeNull();
  });

  it("should pass through other paths when they are not artifact or team pages", () => {
    expect(routeCheckFor("GET", "/")).toBeNull();
    expect(routeCheckFor("GET", "/sign-in")).toBeNull();
    expect(routeCheckFor("GET", "/api/dev/sign-in")).toBeNull();
    expect(routeCheckFor("GET", "/artifact/abc/report")).toBeNull();
  });
});

describe("signInPath", () => {
  it("should return to the page after sign-in when given a path", () => {
    expect(signInPath("/teams/acme")).toBe("/sign-in?next=%2Fteams%2Facme");
  });
});
