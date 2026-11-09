import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * What the MCP route keeps of a client's clientInfo: only `initialize` writes
 * on its own, reads never do, and a failed write never fails the request.
 */

const mocks = vi.hoisted(() => ({ recordClientInfo: vi.fn(), loadConnectionStamp: vi.fn(), hitRateLimit: vi.fn() }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimit: mocks.hitRateLimit }));
vi.mock("@/lib/harness/connection-store", () => ({ recordClientInfo: mocks.recordClientInfo, loadConnectionStamp: mocks.loadConnectionStamp }));

const { connectionHarness, recordRequestClientInfo } = await import("./request-harness");

const connection = { kind: "oauth", userId: "user-1", clientId: "app-1" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordClientInfo.mockResolvedValue(undefined);
  mocks.hitRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

describe("recordRequestClientInfo", () => {
  it("should store clientInfo when the client initializes", async () => {
    const info = await recordRequestClientInfo(connection, { method: "initialize", params: { clientInfo: { name: "claude-code", version: "2.1" } } });
    expect(info).toEqual({ name: "claude-code", version: "2.1" });
    expect(mocks.recordClientInfo).toHaveBeenCalledWith(connection, info);
  });

  it("should not write when a newer client names itself on an ordinary request", async () => {
    const info = await recordRequestClientInfo(connection, { method: "tools/call", params: { _meta: { "io.modelcontextprotocol/clientInfo": { name: "fx" } } } });
    expect(info).toEqual({ name: "fx", version: null });
    expect(mocks.recordClientInfo).not.toHaveBeenCalled();
  });

  it("should answer but store nothing when the person's agents connect over the limit", async () => {
    mocks.hitRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    await expect(recordRequestClientInfo(connection, { method: "initialize", params: { clientInfo: { name: "goose" } } })).resolves.toEqual({ name: "goose", version: null });
    expect(mocks.hitRateLimit).toHaveBeenCalledWith("clientInfoRecord", "user-1");
    expect(mocks.recordClientInfo).not.toHaveBeenCalled();
  });

  it("should still answer when storing clientInfo fails", async () => {
    mocks.recordClientInfo.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recordRequestClientInfo(connection, { method: "initialize", params: { clientInfo: { name: "goose" } } })).resolves.toEqual({ name: "goose", version: null });
  });
});

describe("connectionHarness", () => {
  it("should look the connection up once however many saves ask", async () => {
    mocks.loadConnectionStamp.mockResolvedValue({ harness: "codex", label: null });
    const harness = connectionHarness(connection, null);
    await harness();
    await harness();
    expect(mocks.loadConnectionStamp).toHaveBeenCalledTimes(1);
  });

  it("should not look anything up until a save asks", () => {
    connectionHarness(connection, null);
    expect(mocks.loadConnectionStamp).not.toHaveBeenCalled();
  });
});
