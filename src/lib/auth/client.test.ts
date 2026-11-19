import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * The sign-in link's bot check (src/lib/abuse/bot-check-client.ts) replaces
 * window.fetch when the sign-in form mounts, long after this module loaded,
 * and adds the browser's proof there. A client that kept the fetch it found
 * at load would send the request without the proof, and the server would
 * refuse every person: that shipped once (#252, rolled back the same hour).
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("authClient", () => {
  it("should send a request through the fetch in place when it is sent, not the one found when the module loaded", async () => {
    const atLoad = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ status: true })));
    vi.stubGlobal("fetch", atLoad);
    const { authClient } = await import("@/lib/auth/client");
    const patched = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ status: true })));
    vi.stubGlobal("fetch", patched);
    await authClient.signIn.magicLink({ email: "ada@example.com", callbackURL: "/app" });
    expect(atLoad).not.toHaveBeenCalled();
    expect(patched).toHaveBeenCalledTimes(1);
    const sent = patched.mock.calls[0]?.[0];
    expect(sent instanceof Request ? sent.url : String(sent)).toContain("/sign-in/magic-link");
  });
});
