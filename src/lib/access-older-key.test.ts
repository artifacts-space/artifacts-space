import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ next: [] as unknown[], selects: 0 }));

/** A stand-in for the query builder: every step returns itself, and awaiting it gives the rows. */
function chain(): unknown {
  const step: Record<string, unknown> = {};
  for (const name of ["from", "leftJoin", "where", "limit"]) step[name] = () => step;
  step.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows.next).then(resolve);
  return step;
}

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => {
      rows.selects += 1;
      return chain();
    },
  }),
}));

import { getArtifactAccessByOlderKey } from "./access";

const uuid = "c4537d4c-1a2b-4c3d-8e9f-0123456789ab";

/** A subject row as the query returns it, for an artifact written by "author". */
function subjectRow(visibility: "private" | "team" | "link" | "public", memberId: string | null = null) {
  const record = { id: uuid, publicId: "4fXkP9qR2sT7vW1yZ3aB5c", userId: "author", visibility, teamId: visibility === "team" ? "team-1" : null, approvedVersionId: null, updatedAt: new Date(0), updatedBy: "author", title: "T", icon: null, theme: null, cover: null, harness: null, harnessOverride: null };
  return { record, memberId, ownerMemberId: null, teamPersonal: null, approvedTitle: null, approvedIcon: null, approvedTheme: null, approvedCover: null, approvedSavedAt: null, approvedBy: null, approvedHarness: null };
}

beforeEach(() => {
  rows.next = [];
  rows.selects = 0;
});

const getArtifactAccessByInternalId = (id: string, viewerId: string) => getArtifactAccessByOlderKey({ kind: "internalId", id }, viewerId);

describe("getArtifactAccessByOlderKey", () => {
  it("should let the author read their private artifact by its internal id", async () => {
    rows.next = [subjectRow("private")];
    const access = await getArtifactAccessByInternalId(uuid, "author");
    expect(access?.record.publicId).toBe("4fXkP9qR2sT7vW1yZ3aB5c");
    expect(access?.canEdit).toBe(true);
  });

  it("should give anyone else nothing for a private artifact, as for an id that names no row", async () => {
    rows.next = [subjectRow("private")];
    expect(await getArtifactAccessByInternalId(uuid, "someone-else")).toBeNull();
    rows.next = [];
    expect(await getArtifactAccessByInternalId(uuid, "someone-else")).toBeNull();
  });

  it("should give a team artifact to a member of its team and to nobody outside it", async () => {
    rows.next = [subjectRow("team", "member-row")];
    expect((await getArtifactAccessByInternalId(uuid, "teammate"))?.record.publicId).toBe("4fXkP9qR2sT7vW1yZ3aB5c");
    rows.next = [subjectRow("team", null)];
    expect(await getArtifactAccessByInternalId(uuid, "outsider")).toBeNull();
  });

  it("should cost one query whether the artifact exists, exists but may not be read, or does not exist", async () => {
    const queries = async (found: unknown[], viewer: string) => {
      rows.selects = 0;
      rows.next = found;
      await getArtifactAccessByInternalId(uuid, viewer);
      return rows.selects;
    };
    expect(await queries([subjectRow("private")], "author")).toBe(1);
    expect(await queries([subjectRow("private")], "someone-else")).toBe(1);
    expect(await queries([], "someone-else")).toBe(1);
  });

  it("should cost one query for a legacy share id too, whether it names a row or not", async () => {
    const key = { kind: "shareId" as const, shareId: "0123456789abcdef0123456789abcdef" };
    rows.selects = 0;
    rows.next = [subjectRow("private")];
    expect(await getArtifactAccessByOlderKey(key, "someone-else")).toBeNull();
    rows.next = [];
    expect(await getArtifactAccessByOlderKey(key, "someone-else")).toBeNull();
    expect(rows.selects).toBe(2);
  });
});
