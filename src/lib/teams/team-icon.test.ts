import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as R2 from "@/lib/files/r2";

/*
 * Team icon storage: the bytes are checked before anything is stored, the
 * old object is deleted after a replace or remove (best effort, logged),
 * and an icon is read from R2 only for members of a shared team whose key
 * is one this app made for that team. The database and R2 are mocked.
 */

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  limit: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  streamObject: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => ({ execute: mocks.execute, select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: mocks.limit }) }) }) }) }),
}));
vi.mock("@/lib/files/r2", async (importOriginal) => ({
  R2Error: (await importOriginal<typeof R2>()).R2Error,
  r2ConfigFromEnv: () => ({ accountId: "a", bucket: "b", accessKeyId: "k", secretAccessKey: "s" }),
  putObject: mocks.putObject,
  deleteObject: mocks.deleteObject,
  streamObject: mocks.streamObject,
}));

const { memberIconKeyQuery, memberTeamIcon, removeTeamIcon, saveTeamIcon } = await import("./team-icon");
const { R2Error } = await import("@/lib/files/r2");
const { neon } = await import("@neondatabase/serverless");
const { drizzle } = await import("drizzle-orm/neon-http");

const oldKey = "team-icons/team-1/7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a.png";
const newKeyPattern = /^team-icons\/team-1\/[0-9a-f-]{36}\.png$/;

function validPng(): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...encoder.encode(type), ...data, 0, 0, 0, 0];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [0, 0, 1, 0, 0, 0, 1, 0, 8, 6, 0, 0, 0]), ...chunk("IEND", [])]);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
});

describe("saveTeamIcon", () => {
  it("should store the new icon, then delete the one it replaced", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: oldKey }] });
    await saveTeamIcon("team-1", validPng());
    expect(mocks.putObject).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(newKeyPattern), expect.any(Uint8Array), "image/png");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), oldKey);
  });

  it("should store nothing when the bytes are not a square PNG or WebP", async () => {
    await expect(saveTeamIcon("team-1", new TextEncoder().encode("<svg/>"))).rejects.toThrow("The icon must be a PNG or WebP image.");
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("should keep the new icon when deleting the old one fails, and log it", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: oldKey }] });
    mocks.deleteObject.mockRejectedValue(new Error("R2 down"));
    await expect(saveTeamIcon("team-1", validPng())).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[team-icon] Deleting the old icon failed", "Error");
  });

  it("should never delete a previous value that is not this team's icon key", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: "files/7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a/report.pdf" }] });
    await saveTeamIcon("team-1", validPng());
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("should delete the uploaded object and refuse when the team is personal", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(saveTeamIcon("team-1", validPng())).rejects.toThrow("Personal teams have no icon.");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(newKeyPattern));
  });

  it("should delete the uploaded object when the database refuses the change", async () => {
    mocks.execute.mockRejectedValue(new Error("db down"));
    await expect(saveTeamIcon("team-1", validPng())).rejects.toThrow("db down");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(newKeyPattern));
  });
});

describe("removeTeamIcon", () => {
  it("should clear the key and delete the old object", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: oldKey }] });
    await removeTeamIcon("team-1");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), oldKey);
  });

  it("should succeed without deleting anything when there was no icon", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: null }] });
    await removeTeamIcon("team-1");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});

describe("memberTeamIcon", () => {
  const object = { body: new ReadableStream<Uint8Array>(), size: 3 };

  it("should stream the icon for a member of the team, capped at the 1 MB upload cap, with the id its URL carries", async () => {
    mocks.limit.mockResolvedValue([{ logo: oldKey }]);
    mocks.streamObject.mockResolvedValue(object);
    expect(await memberTeamIcon("user-1", "team-1")).toEqual({ ...object, type: "image/png", id: "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a" });
    expect(mocks.streamObject).toHaveBeenCalledWith(expect.anything(), oldKey, 1_000_000);
  });

  it("should never read the icon for someone outside the team or for a personal team, which the query returns no row for", async () => {
    mocks.limit.mockResolvedValue([]);
    expect(await memberTeamIcon("stranger", "team-1")).toBeNull();
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("should never read a stored key that belongs to another team", async () => {
    mocks.limit.mockResolvedValue([{ logo: "team-icons/team-2/7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a.png" }]);
    expect(await memberTeamIcon("user-1", "team-1")).toBeNull();
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("should return null when the team has no icon", async () => {
    mocks.limit.mockResolvedValue([{ logo: null }]);
    expect(await memberTeamIcon("user-1", "team-1")).toBeNull();
    expect(mocks.streamObject).not.toHaveBeenCalled();
  });

  it("should return null, so the team letter shows, when a stored icon is over the 1 MB cap", async () => {
    mocks.limit.mockResolvedValue([{ logo: oldKey }]);
    mocks.streamObject.mockRejectedValue(new R2Error("GET", 413));
    expect(await memberTeamIcon("user-1", "team-1")).toBeNull();
  });

  it("should still fail when R2 itself fails", async () => {
    mocks.limit.mockResolvedValue([{ logo: oldKey }]);
    mocks.streamObject.mockRejectedValue(new R2Error("GET", 503));
    await expect(memberTeamIcon("user-1", "team-1")).rejects.toThrow("status 503");
  });

  it("should return null when the object is gone from storage", async () => {
    mocks.limit.mockResolvedValue([{ logo: oldKey }]);
    mocks.streamObject.mockResolvedValue(null);
    expect(await memberTeamIcon("user-1", "team-1")).toBeNull();
  });
});

describe("memberIconKeyQuery", () => {
  const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

  it("should reach the icon only through the viewer's own membership in a shared team", () => {
    const { sql, params } = memberIconKeyQuery(db, "user-1", "team-1").toSQL();
    expect(sql).toContain('inner join "team" on "team"."id" = "team_member"."team_id"');
    expect(sql).toMatch(/where \("team_member"\."user_id" = \$\d+ and "team"\."id" = \$\d+ and "team"\."personal" = \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(["user-1", "team-1", false]));
    expect(sql).not.toMatch(/"(\w+)" = "\1"(?!\.)/);
  });
});
