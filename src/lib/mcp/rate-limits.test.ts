import { describe, expect, it } from "vitest";

import { jsonRpcId, mcpLimitChecks, mcpRateLimitedResponse, mcpToolCalls } from "./rate-limits";

const principal = { userId: "u1", tokenKey: "api:t1" };
const call = (name: string, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } });

describe("mcpToolCalls", () => {
  it("should list tool names when the body calls tools, singly or in a batch", () => {
    expect(mcpToolCalls(call("artifacts_get"))).toEqual(["artifacts_get"]);
    expect(mcpToolCalls([call("artifacts_list"), call("artifacts_update", 2)])).toEqual(["artifacts_list", "artifacts_update"]);
  });

  it("should list nothing when the body is not a tool call", () => {
    expect(mcpToolCalls({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toEqual([]);
    expect(mcpToolCalls(null)).toEqual([]);
    expect(mcpToolCalls("junk")).toEqual([]);
  });
});

describe("mcpLimitChecks", () => {
  it("should count every read tool per token and per user", () => {
    for (const name of ["artifacts_list", "artifacts_get", "comments_list", "inbox_list", "files_get_download_url"]) {
      expect(mcpLimitChecks(principal, [name])).toEqual([
        { name: "readByToken", subject: "api:t1" },
        { name: "readByUser", subject: "u1" },
      ]);
    }
  });

  it("should count artifact edits per token when the tool changes an artifact", () => {
    expect(mcpLimitChecks(principal, ["artifacts_update"])).toEqual([{ name: "artifactUpdateByToken", subject: "api:t1" }]);
    expect(mcpLimitChecks(principal, ["files_attach"])).toEqual([{ name: "artifactUpdateByToken", subject: "api:t1" }]);
    expect(mcpLimitChecks(principal, ["artifacts_restore_version"])).toEqual([{ name: "artifactUpdateByToken", subject: "api:t1" }]);
  });

  it("should count nothing here when the tool has its own limit elsewhere", () => {
    expect(mcpLimitChecks(principal, ["artifacts_create", "comment_create", "files_request_upload"])).toEqual([]);
  });

  it("should count each limit once when a batch repeats a tool", () => {
    expect(mcpLimitChecks(principal, ["artifacts_get", "artifacts_get"])).toHaveLength(2);
  });
});

describe("mcpRateLimitedResponse", () => {
  it("should answer 429 with Retry-After and a plain message when a limit is reached", async () => {
    const response = mcpRateLimitedResponse({ name: "readByToken", retryAfterSeconds: 120 }, "Slow down. Try again in about 2 minutes.", jsonRpcId(call("artifacts_get", 7)));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    const body = (await response.json()) as { id: number; error: { message: string; data: { retryAfterSeconds: number } } };
    expect(body.id).toBe(7);
    expect(body.error.message).toContain("Try again");
    expect(body.error.data.retryAfterSeconds).toBe(120);
  });
});
