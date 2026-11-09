import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { nextCookies } from "better-auth/next-js";
import { testUtils } from "better-auth/plugins";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionConfig, sessionLifetimeSeconds } from "./session-config";

/*
 * Session renewal through the real proxy and a real Better Auth instance with
 * the app's session options, in memory. Only the database is swapped (the
 * memory adapter stands in for Postgres), so this pins the contract the
 * 30-day sessions depend on: getSession with `returnHeaders` hands back the
 * renewed cookie, and the proxy passes it to the browser.
 */

const origin = "https://artifacts.space";
const day = 24 * 60 * 60 * 1000;

function createTestAuth() {
  return betterAuth({
    baseURL: origin,
    secret: "session-renewal-test-secret-0123456789abcdef",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    session: sessionConfig,
    // nextCookies stays last, as in src/lib/auth/server.ts.
    plugins: [testUtils(), nextCookies()],
  });
}

const auth = { current: createTestAuth() };

vi.mock("@/lib/auth/server", () => ({ getAuth: () => auth.current }));

const { proxy } = await import("@/proxy");

/** A signed-in browser's session cookie, without the 5-minute cache, and the session token. */
async function signIn() {
  const context = await auth.current.$context;
  const user = await context.test.saveUser(context.test.createUser({ email: "renewal@example.com" }));
  const login = await context.test.login({ userId: user.id });
  const tokenCookie = login.cookies.find((cookie) => cookie.name === "__Secure-better-auth.session_token");
  if (!tokenCookie) throw new Error("The test login set no session cookie.");
  return { cookie: `${tokenCookie.name}=${tokenCookie.value}`, token: login.token, context };
}

function sessionCookieFrom(response: Response) {
  return response.headers.getSetCookie().find((value) => value.startsWith("__Secure-better-auth.session_token="));
}

describe("session renewal through the proxy", () => {
  beforeEach(() => {
    auth.current = createTestAuth();
  });

  it("should renew the session cookie for 30 days when the session was last renewed over a day ago", async () => {
    const { cookie, token, context } = await signIn();
    // Renewed 10 days ago: 20 days left of 30.
    await context.internalAdapter.updateSession(token, { expiresAt: new Date(Date.now() + 20 * day) });

    const response = await proxy(new NextRequest(new URL("/app", origin), { headers: { cookie } }));

    expect(response.headers.get("location")).toBeNull();
    const renewed = sessionCookieFrom(response);
    expect(renewed).toContain(`Max-Age=${String(sessionLifetimeSeconds)}`);
    expect(renewed).toMatch(/Secure/);
    const stored = await context.internalAdapter.findSession(token);
    expect(stored?.session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * day);
  });

  it("should leave the session cookie alone and refresh only the 5-minute cache when it was renewed today", async () => {
    const { cookie } = await signIn();

    const response = await proxy(new NextRequest(new URL("/app", origin), { headers: { cookie } }));

    expect(response.headers.get("location")).toBeNull();
    expect(sessionCookieFrom(response)).toBeUndefined();
    expect(response.headers.getSetCookie().some((value) => value.startsWith("__Secure-better-auth.session_data="))).toBe(true);
  });

  it("should send an expired session to sign-in and expire its cookie when the session is past its lifetime", async () => {
    const { cookie, token, context } = await signIn();
    await context.internalAdapter.updateSession(token, { expiresAt: new Date(Date.now() - day) });

    const response = await proxy(new NextRequest(new URL("/app", origin), { headers: { cookie } }));

    expect(response.headers.get("location")).toBe(`${origin}/sign-in?next=%2Fapp`);
    expect(sessionCookieFrom(response)).toMatch(/^__Secure-better-auth\.session_token=;.*Max-Age=0/);
  });
});
