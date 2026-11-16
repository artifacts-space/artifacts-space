import { beforeEach, describe, expect, it, vi } from "vitest";

/* The cleanup job runs sweepCaptures on every deployment, also one that serves before the frame capture table's migration. */

const failure = vi.hoisted(() => ({ error: new Error("unset") }));
vi.mock("@/db", () => {
  const fail = () => Promise.reject(failure.error);
  const chain: Record<string, unknown> = {};
  for (const step of ["update", "set", "where", "select", "from", "orderBy", "limit", "delete"]) chain[step] = () => chain;
  chain.returning = fail;
  chain.then = (...handlers: [unknown, (reason: unknown) => unknown]) => fail().catch(handlers[1]);
  return { getDb: () => ({ ...chain, execute: fail }) };
});

const { sweepCaptures } = await import("./captures-store");

describe("sweepCaptures", () => {
  beforeEach(() => {
    failure.error = new Error("unset");
  });

  it("should report nothing to clean up when the frame capture table does not exist", async () => {
    failure.error = new Error("Failed query", { cause: { code: "42P01" } });
    expect(await sweepCaptures(new Date())).toEqual({ removed: 0, remaining: false });
  });

  it("should fail on any other database error, so the cleanup job reports it", async () => {
    failure.error = new Error("Failed query", { cause: { code: "57014" } });
    await expect(sweepCaptures(new Date())).rejects.toThrow("Failed query");
  });
});
