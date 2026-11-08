import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Who may delete an artifact, through the real lookup with the database
 * stubbed: the author, or the person who added the agent that wrote it. The
 * owner check's SQL (owner id and team membership bound to the viewer) is
 * tested in owner-access.test.ts; here an empty owner match stands for every
 * non-owner: a teammate, an admin of the agent's team, the owner of another
 * agent, a sibling agent, or an owner who left the team.
 */

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][] }));

function chain(): unknown {
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "from", "where", "innerJoin", "leftJoin"]) builder[name] = () => builder;
  builder.limit = () => Promise.resolve(mocks.rows.shift() ?? []);
  return builder;
}

vi.mock("@/db", () => ({ getDb: () => ({ select: () => chain() }) }));

const { findDeletableArtifact } = await import("./owner-access");

const agentArtifact = { id: "art-1", publicId: "4fXkP9qR2sT7vW1yZ3aB5c", userId: "agent-1", visibility: "private" };

describe("findDeletableArtifact", () => {
  beforeEach(() => {
    mocks.rows = [];
  });

  it("should return the artifact when its author deletes it", async () => {
    mocks.rows = [[{ ...agentArtifact, userId: "person-1" }]];
    await expect(findDeletableArtifact("person-1", { id: "art-1" })).resolves.toMatchObject({ id: "art-1" });
  });

  it("should return the agent's artifact when the person who added the agent deletes it", async () => {
    mocks.rows = [[agentArtifact], [{ id: "agent-1" }]];
    await expect(findDeletableArtifact("owner-1", { publicId: agentArtifact.publicId })).resolves.toMatchObject({ id: "art-1" });
  });

  for (const viewer of ["teammate", "team-admin", "other-agent-owner", "sibling-agent", "owner-who-left"]) {
    it(`should refuse ${viewer} when they do not act for the agent that wrote it`, async () => {
      mocks.rows = [[agentArtifact], []];
      await expect(findDeletableArtifact(viewer, { id: "art-1" })).resolves.toBeNull();
    });
  }

  it("should refuse anyone without a lookup when the public id is malformed", async () => {
    await expect(findDeletableArtifact("sibling-agent", { publicId: "not-an-id" })).resolves.toBeNull();
  });
});
