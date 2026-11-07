import type * as AuthenticateModule from "@/lib/mcp/authenticate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticateMcpRequest: vi.fn(), getSession: vi.fn() }));

vi.mock("@/lib/mcp/authenticate", async (importOriginal) => ({ ...(await importOriginal<typeof AuthenticateModule>()), authenticateMcpRequest: mocks.authenticateMcpRequest }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

const { resolveRequestViewer, viewerUserId } = await import("./request-viewer");

function request(headers: Record<string, string> = {}) {
  return new Request("https://artifacts.space/artifact/x.md", { headers });
}

describe("resolveRequestViewer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should use the token's user when a valid bearer token is sent", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue({ userId: "u1", access: "read", via: "oauth", tokenKey: "oauth:c:u1" });
    expect(await resolveRequestViewer(request({ authorization: "Bearer good" }))).toEqual({ status: "token", userId: "u1", tokenKey: "oauth:c:u1" });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("should refuse the request, not fall back to the session, when the bearer token is invalid", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue({ user: { id: "cookie-user" } });
    const viewer = await resolveRequestViewer(request({ authorization: "Bearer bad", cookie: "better-auth.session_token=a.b" }));
    expect(viewer).toEqual({ status: "invalid-token" });
    expect(viewerUserId(viewer)).toBeNull();
  });

  it("should use the session when no bearer token is sent, and be anonymous without one", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "cookie-user" } }).mockResolvedValueOnce(null);
    expect(await resolveRequestViewer(request())).toEqual({ status: "session", userId: "cookie-user" });
    expect(await resolveRequestViewer(request())).toEqual({ status: "anonymous" });
  });
});
