import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ getDb: vi.fn() }));

const { tooManyRequests } = await import("./responses");

describe("tooManyRequests", () => {
  it("should answer 429 with Retry-After and a plain-English body when a limit is reached", async () => {
    const response = tooManyRequests({ name: "fileDownloadByNetwork", retryAfterSeconds: 300 }, { "X-Content-Type-Options": "nosniff" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("Your network has opened a lot of files in the last hour. Try again in about 5 minutes.");
  });
});
