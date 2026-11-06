import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const db = vi.hoisted(() => ({
  rows: [] as { action: string }[],
  inserted: [] as unknown[],
  conflictIgnored: 0,
  deletes: 0,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve(db.rows) }) }),
    insert: () => ({
      values: (value: unknown) => ({
        onConflictDoNothing: () => {
          db.inserted.push(value);
          db.conflictIgnored += 1;
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: () => {
        db.deletes += 1;
        return Promise.resolve();
      },
    }),
  }),
}));

const { listSkippedConfirmations, resetConfirmations, skipConfirmation } = await import("./store");

beforeEach(() => {
  db.rows = [];
  db.inserted = [];
  db.conflictIgnored = 0;
  db.deletes = 0;
});

describe("listSkippedConfirmations", () => {
  it("should return the saved actions when every row is a known action", async () => {
    db.rows = [{ action: "deleteArtifact" }, { action: "leaveTeam" }];
    await expect(listSkippedConfirmations("user-1")).resolves.toEqual(["deleteArtifact", "leaveTeam"]);
  });

  it("should leave out rows when their action no longer exists", async () => {
    db.rows = [{ action: "deleteArtifact" }, { action: "retiredAction" }];
    await expect(listSkippedConfirmations("user-1")).resolves.toEqual(["deleteArtifact"]);
  });

  it("should return an empty list when nothing is skipped", async () => {
    await expect(listSkippedConfirmations("user-1")).resolves.toEqual([]);
  });
});

describe("skipConfirmation", () => {
  it("should save the action for the user when the action is known", async () => {
    await expect(skipConfirmation("user-1", "revokeToken")).resolves.toBe("revokeToken");
    expect(db.inserted).toEqual([{ userId: "user-1", action: "revokeToken" }]);
  });

  it("should ignore a duplicate when the action is already skipped", async () => {
    await skipConfirmation("user-1", "removeAgent");
    expect(db.conflictIgnored).toBe(1);
  });

  it("should reject the action without writing when it is unknown", async () => {
    await expect(skipConfirmation("user-1", "dropDatabase")).rejects.toBeInstanceOf(ZodError);
    expect(db.inserted).toEqual([]);
  });

  it("should reject the action without writing when it is not a string", async () => {
    await expect(skipConfirmation("user-1", { action: "deleteArtifact" })).rejects.toBeInstanceOf(ZodError);
    expect(db.inserted).toEqual([]);
  });
});

describe("resetConfirmations", () => {
  it("should delete the user's skipped confirmations when called", async () => {
    await resetConfirmations("user-1");
    expect(db.deletes).toBe(1);
  });
});
