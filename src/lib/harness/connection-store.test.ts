import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A person changes the harness only for their own, live connections: an app
 * they approved, or a token they have not revoked. The ownership lookups and
 * the upsert are mocked at the database.
 */

const mocks = vi.hoisted(() => ({
  ownerRows: vi.fn<() => unknown[]>(() => []),
  inserted: vi.fn(),
  conflict: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(mocks.ownerRows()) }) }) }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserted(values);
        return { onConflictDoUpdate: (config: Record<string, unknown>) => { mocks.conflict(config); return Promise.resolve(); } };
      },
    }),
  }),
}));

const { loadConnectionStamp, setConnectionHarnessOverride, toConnectionHarness } = await import("./connection-store");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setConnectionHarnessOverride", () => {
  it("should refuse and write nothing when the app is not one the person approved", async () => {
    mocks.ownerRows.mockReturnValue([]);
    await expect(setConnectionHarnessOverride({ kind: "oauth", userId: "user-1", clientId: "someone-elses-app" }, "codex")).resolves.toBe(false);
    expect(mocks.inserted).not.toHaveBeenCalled();
  });

  it("should refuse and write nothing when the token is another person's or revoked", async () => {
    mocks.ownerRows.mockReturnValue([]);
    await expect(setConnectionHarnessOverride({ kind: "api-token", userId: "user-1", tokenId: "token-9" }, "cursor")).resolves.toBe(false);
    expect(mocks.inserted).not.toHaveBeenCalled();
  });

  it("should save the override for the person's own app", async () => {
    mocks.ownerRows.mockReturnValue([{ id: "consent-1" }]);
    await expect(setConnectionHarnessOverride({ kind: "oauth", userId: "user-1", clientId: "app-1" }, "claude-code")).resolves.toBe(true);
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", oauthClientId: "app-1", apiTokenId: null, harnessOverride: "claude-code" }));
    expect(mocks.conflict).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({ harnessOverride: "claude-code" }) as unknown }));
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("harnessChoice", "user-1");
  });

  it("should write nothing when the person is over the rate limit", async () => {
    mocks.ownerRows.mockReturnValue([{ id: "consent-1" }]);
    mocks.enforceRateLimit.mockRejectedValueOnce(new Error("Too many changes"));
    await expect(setConnectionHarnessOverride({ kind: "oauth", userId: "user-1", clientId: "app-1" }, "codex")).rejects.toThrow("Too many changes");
    expect(mocks.inserted).not.toHaveBeenCalled();
  });

  it("should clear the override for the person's own token", async () => {
    mocks.ownerRows.mockReturnValue([{ id: "token-1" }]);
    await expect(setConnectionHarnessOverride({ kind: "api-token", userId: "user-1", tokenId: "token-1" }, null)).resolves.toBe(true);
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ apiTokenId: "token-1", oauthClientId: null, harnessOverride: null }));
  });
});

describe("toConnectionHarness", () => {
  it("should show what was detected and the person's override", () => {
    expect(toConnectionHarness({ clientName: "codex-mcp-client", override: "cursor" })).toEqual({ detected: "codex", detectedLabel: null, override: "cursor" });
  });

  it("should keep an unknown client's own name for its owner", () => {
    expect(toConnectionHarness({ clientName: "zed", override: null })).toEqual({ detected: "other", detectedLabel: "zed", override: null });
  });

  it("should drop an override that is not a known harness", () => {
    expect(toConnectionHarness({ clientName: null, override: "bogus", oauthName: "Windsurf" })).toEqual({ detected: "windsurf", detectedLabel: null, override: null });
  });
});

describe("loadConnectionStamp", () => {
  const token = { kind: "api-token", userId: "user-1", tokenId: "token-1" } as const;
  const stored = { clientName: "codex-mcp-client", clientVersion: "1.0.0", override: null };

  it("should store a new version when a client keeps its name and upgrades", async () => {
    mocks.ownerRows.mockReturnValue([stored]);
    await loadConnectionStamp(token, { name: "codex-mcp-client", version: "1.1.0" });
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ clientName: "codex-mcp-client", clientVersion: "1.1.0" }));
  });

  it("should write nothing when the client sends what is already stored", async () => {
    mocks.ownerRows.mockReturnValue([stored]);
    await loadConnectionStamp(token, { name: "codex-mcp-client", version: "1.0.0" });
    expect(mocks.inserted).not.toHaveBeenCalled();
  });

  it("should still stamp the detected harness when storing the clientInfo fails", async () => {
    mocks.ownerRows.mockReturnValue([]);
    mocks.conflict.mockImplementationOnce(() => { throw new Error("db down"); });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(loadConnectionStamp(token, { name: "claude-code", version: "2.0.0" })).resolves.toEqual({ harness: "claude-code", label: null });
  });
});
