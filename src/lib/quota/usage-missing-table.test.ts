import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* fileBytesUsed backs every upload. Where the frame capture table does not exist yet, uploads must keep working. */

const execute = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ getDb: () => ({ execute }) }));

const { fileBytesUsed } = await import("./usage");

const text = (query: unknown) => new PgDialect().sqlToQuery(query as SQL).sql;
const missingTable = () => new Error("Failed query", { cause: { code: "42P01" } });

describe("fileBytesUsed", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("should count files, copies, and frame captures in one query when every table exists", async () => {
    execute.mockResolvedValueOnce({ rows: [{ bytes: "1230" }] });
    expect(await fileBytesUsed("user-1")).toBe(1230);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(text(execute.mock.calls[0]?.[0])).toContain('"frame_capture"');
  });

  it("should count files and copies without frame captures when the frame capture table does not exist", async () => {
    execute.mockRejectedValueOnce(missingTable()).mockResolvedValueOnce({ rows: [{ bytes: "40" }] });
    expect(await fileBytesUsed("user-1")).toBe(40);
    expect(execute).toHaveBeenCalledTimes(2);
    const second = text(execute.mock.calls[1]?.[0]);
    expect(second).not.toContain("frame_capture");
    expect(second).toContain('"artifact_file"');
    expect(second).toContain('"artifact_file_copy"');
  });

  it("should fail when another table is missing too, so a quota is never read as empty", async () => {
    execute.mockRejectedValueOnce(missingTable()).mockRejectedValueOnce(missingTable());
    await expect(fileBytesUsed("user-1")).rejects.toThrow("Failed query");
  });

  it("should fail on any other database error without a second query", async () => {
    execute.mockRejectedValueOnce(new Error("Failed query", { cause: { code: "57014" } }));
    await expect(fileBytesUsed("user-1")).rejects.toThrow("Failed query");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
