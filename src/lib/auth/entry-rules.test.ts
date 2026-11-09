import { describe, expect, it } from "vitest";

import { signInPath } from "@/lib/route-status";

import {
  authCookiesToExpire,
  authPageDecisionFor,
  entryDecisionFor,
  entryPageFor,
  workspaceDecisionFor,
  workspaceHome,
  type EntryPage,
} from "./entry-rules";

const none = new URLSearchParams();

describe("entryPageFor", () => {
  it("should name the landing page when the path is the site root", () => {
    expect(entryPageFor("GET", "/")).toBe("landing");
    expect(entryPageFor("HEAD", "/")).toBe("landing");
  });

  it("should name the auth pages when the path is sign-in or sign-up", () => {
    for (const path of ["/sign-in", "/sign-up", "/sign-in/"]) expect(entryPageFor("GET", path)).toBe("auth");
  });

  it("should ignore every other path and every non-page method", () => {
    for (const path of ["/docs", "/app", "/sign-in-help", "/sign-out", "/oauth/sign-in"]) expect(entryPageFor("GET", path)).toBeNull();
    expect(entryPageFor("POST", "/")).toBeNull();
    expect(entryPageFor("POST", "/sign-in")).toBeNull();
  });
});

describe("entryDecisionFor", () => {
  const pages: Exclude<EntryPage, null>[] = ["landing", "auth"];

  it("should pass every entry page through when there is no session cookie", () => {
    for (const page of pages) expect(entryDecisionFor(page, false, none)).toEqual({ action: "pass" });
  });

  it("should send the landing page to the workspace on cookie presence alone when a session cookie is present", () => {
    expect(entryDecisionFor("landing", true, none)).toEqual({ action: "redirect", to: workspaceHome });
  });

  it("should show the landing page when a signed-in visitor asks for it with ?home", () => {
    expect(entryDecisionFor("landing", true, new URLSearchParams("home"))).toEqual({ action: "pass" });
  });

  it("should ask for the real session when a sign-in page is loaded with a session cookie", () => {
    expect(entryDecisionFor("auth", true, none)).toEqual({ action: "check-session" });
  });
});

describe("authPageDecisionFor", () => {
  it("should send a signed-in person to the workspace when there is no next path", () => {
    expect(authPageDecisionFor(true, null)).toEqual({ action: "redirect", to: "/app", expireCookies: false });
  });

  it("should send a signed-in person to the next path when it stays on this site", () => {
    expect(authPageDecisionFor(true, "/teams/acme")).toMatchObject({ to: "/teams/acme" });
  });

  it("should ignore a next path that leaves the site when the person is signed in", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      expect(authPageDecisionFor(true, next)).toMatchObject({ to: "/app" });
    }
  });

  it("should show the page and expire the cookies when the cookie is stale", () => {
    expect(authPageDecisionFor(false, "/app")).toEqual({ action: "pass", expireCookies: true });
  });
});

describe("workspaceDecisionFor", () => {
  it("should pass a signed-in person through without touching the cookies", () => {
    expect(workspaceDecisionFor(true, "/sign-in?next=%2Fapp")).toEqual({ action: "pass", expireCookies: false });
  });

  it("should send a stale cookie to sign-in and expire it when the session is gone", () => {
    expect(workspaceDecisionFor(false, "/sign-in?next=%2Fapp")).toEqual({ action: "redirect", to: "/sign-in?next=%2Fapp", expireCookies: true });
  });
});

describe("authCookiesToExpire", () => {
  it("should pick Better Auth's session cookies with or without the secure prefix", () => {
    const names = [
      "__Secure-better-auth.session_token",
      "better-auth.session_token",
      "__Secure-better-auth.session_data",
      "__Secure-better-auth.session_data.0",
      "__Secure-better-auth.dont_remember",
      "theme",
      "__Secure-better-auth.state",
      "other.session_token",
    ];
    expect(authCookiesToExpire(names)).toEqual(names.slice(0, 5));
  });
});

interface Browser {
  cookie: boolean;
  sessionValid: boolean;
}

/** One request, decided as src/proxy.ts would: the next path to follow, or null when a page is shown. */
function entryStep(url: URL, page: Exclude<EntryPage, null>, browser: Browser): string | null {
  const entry = entryDecisionFor(page, browser.cookie, url.searchParams);
  if (entry.action !== "check-session") return entry.action === "redirect" ? entry.to : null;
  const decision = authPageDecisionFor(browser.cookie && browser.sessionValid, url.searchParams.get("next"));
  if (decision.expireCookies) browser.cookie = false;
  return decision.action === "redirect" ? decision.to : null;
}

/** A workspace page: no cookie goes to sign-in at once, otherwise the real session check decides. */
function workspaceStep(url: URL, browser: Browser): string | null {
  const target = signInPath(`${url.pathname}${url.search}`);
  if (!browser.cookie) return target;
  const decision = workspaceDecisionFor(browser.sessionValid, target);
  if (decision.expireCookies) browser.cookie = false;
  return decision.action === "redirect" ? decision.to : null;
}

/** Follows the redirects a browser would until a page is shown. Throws on a loop. */
function browse(start: string, browser: Browser) {
  const visited: string[] = [];
  let path: string | null = start;
  while (path !== null) {
    if (visited.length >= 10) throw new Error(`Redirect loop: ${visited.join(" -> ")}`);
    visited.push(path);
    const url: URL = new URL(path, "https://artifacts.space");
    const page = entryPageFor("GET", url.pathname);
    path = page ? entryStep(url, page, browser) : workspaceStep(url, browser);
  }
  return { visited, shown: visited.at(-1) };
}

describe("signed-in redirects end to end", () => {
  it("should land a signed-in visitor of / on the workspace", () => {
    expect(browse("/", { cookie: true, sessionValid: true })).toEqual({ visited: ["/", "/app"], shown: "/app" });
  });

  it("should send a signed-in visitor of the sign-in page to the workspace", () => {
    expect(browse("/sign-in", { cookie: true, sessionValid: true }).shown).toBe("/app");
  });

  it("should stop on the sign-in page and clear the cookie when the cookie is stale", () => {
    const browser = { cookie: true, sessionValid: false };
    expect(browse("/", browser)).toEqual({ visited: ["/", "/app", "/sign-in?next=%2Fapp"], shown: "/sign-in?next=%2Fapp" });
    expect(browser.cookie).toBe(false);
    // The next visit to / shows the landing page instead of bouncing again.
    expect(browse("/", browser)).toEqual({ visited: ["/"], shown: "/" });
  });

  it("should never loop when a stale cookie starts on the sign-in page or the workspace", () => {
    for (const start of ["/sign-in", "/sign-up", "/sign-in?next=%2Fapp", "/app", "/inbox"]) {
      expect(() => browse(start, { cookie: true, sessionValid: false })).not.toThrow();
    }
  });

  it("should show the landing page to a signed-in visitor when the URL is /?home", () => {
    expect(browse("/?home", { cookie: true, sessionValid: true }).shown).toBe("/?home");
  });

  it("should show the landing page when the visitor has no cookie", () => {
    expect(browse("/", { cookie: false, sessionValid: false }).shown).toBe("/");
  });
});
