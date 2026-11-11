import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type * as History from "./history";
import type * as VersionService from "./service";

/*
 * A save's approval on a team's public artifact, against a real Postgres:
 * the owner's edits apply at once, an agent's wait for approval. The save
 * writes its version and its approval in its own statement (save-write.ts),
 * so a save that lands in any gap of another never takes its approval away.
 * These tests open the gaps on purpose: after a person's statement, while
 * its housekeeping runs, and between a person's approval plan and its
 * UPDATE. It runs only when TEST_DATABASE_URL names a throwaway local
 * database with the migrations applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

/** One-shot pauses: `run` is awaited once, at the named step, then cleared. */
const gaps = vi.hoisted(() => ({ afterPersonWrite: null as (() => Promise<void>) | null, beforePersonWrite: null as (() => Promise<void>) | null }));

// A person's save's housekeeping after its statement (pruning) waits for the test.
vi.mock("./history", async (importOriginal) => {
  const real = await importOriginal<typeof History>();
  return {
    ...real,
    pruneArtifactVersions: async (...args: Parameters<typeof real.pruneArtifactVersions>) => {
      const run = gaps.afterPersonWrite;
      gaps.afterPersonWrite = null;
      if (run) await run();
      return real.pruneArtifactVersions(...args);
    },
  };
});

// A person's approval plan is made, then the test acts before the person's UPDATE runs.
vi.mock("./service", async (importOriginal) => {
  const real = await importOriginal<typeof VersionService>();
  return {
    ...real,
    planVersionedChangeApproval: async (...args: Parameters<typeof real.planVersionedChangeApproval>) => {
      const plan = await real.planVersionedChangeApproval(...args);
      const run = args[3] === "person" ? gaps.beforePersonWrite : null;
      if (run) {
        gaps.beforePersonWrite = null;
        await run();
      }
      return plan;
    },
  };
});

describe.runIf(Boolean(databaseUrl))("a save's approval with a database", async () => {
  const { and, eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactVersion, rateLimitBucket, sharingRequest, team, teamMember, user } = await import("@/db/schema");
  const artifacts = await import("@/lib/artifacts");
  const { encodeBaseVersion } = await import("@/lib/edits/edit-conflict-rules");

  const tag = randomUUID().slice(0, 8);
  const owner = `approval-${tag}-owner`;
  const teamId = `approval-${tag}-team`;
  const claude = { harness: "claude-code" as const, label: null };

  async function row(id: string) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, id)).limit(1);
    if (!found) throw new Error("No such artifact.");
    return found;
  }

  async function readBase(id: string) {
    return encodeBaseVersion({ versionId: null, updatedAt: (await row(id)).updatedAt });
  }

  async function versionContent(versionId: string | null) {
    if (!versionId) return null;
    const [version] = await getDb().select({ content: artifactVersion.content, summary: artifactVersion.summary }).from(artifactVersion).where(eq(artifactVersion.id, versionId));
    return version ?? null;
  }

  async function pendingRequest(artifactId: string) {
    const [request] = await getDb().select().from(sharingRequest).where(and(eq(sharingRequest.artifactId, artifactId), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")));
    return request ?? null;
  }

  /** The owner's artifact, shared publicly through their team: their edits apply, an agent's wait for approval. */
  async function teamPublicArtifact() {
    const page = await artifacts.createArtifact(owner, { title: "Plan", content: "# Plan\n\nv0" });
    await getDb().update(artifact).set({ teamId, visibility: "public" }).where(eq(artifact.id, page.id));
    return row(page.id);
  }

  const agentSummary = async (id: string, summary: string) => artifacts.updateArtifact(owner, id, { summary }, "agent", { harness: claude, baseVersion: await readBase(id) });

  beforeAll(async () => {
    await getDb().insert(user).values({ id: owner, name: owner, email: `${owner}@example.com` });
    await getDb().insert(team).values({ id: teamId, name: "Approval team", slug: teamId, personal: false });
    await getDb().insert(teamMember).values({ id: `${teamId}-m`, teamId, userId: owner, role: "owner" });
  });

  afterEach(() => {
    gaps.afterPersonWrite = null;
    gaps.beforePersonWrite = null;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(eq(artifact.userId, owner));
    await db.delete(team).where(eq(team.id, teamId));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%approval-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [owner]));
  });

  it("should keep the person's applied save approved when an agent saves while the person's save is still finishing", async () => {
    const page = await teamPublicArtifact();
    let agentSaved: Promise<unknown> = Promise.resolve();
    // The agent reads the person's save as soon as it landed and saves the summary, before the person's save is done.
    gaps.afterPersonWrite = async () => {
      agentSaved = agentSummary(page.id, "The agent's summary");
      await agentSaved;
    };
    const person = await artifacts.saveArtifactUpdate(owner, page.id, { content: "# Plan\n\nthe owner's v1" }, "person", { expectedUpdatedAt: page.updatedAt.toISOString() });
    await agentSaved;

    expect(person?.artifact.content).toBe("# Plan\n\nthe owner's v1");
    const current = await row(page.id);
    expect(current.summary).toBe("The agent's summary");
    expect((await versionContent(current.approvedVersionId))?.content, "readers outside the team see the owner's save").toBe("# Plan\n\nthe owner's v1");
    const request = await pendingRequest(page.id);
    expect((await versionContent(request?.versionId ?? null))?.summary, "the agent's save waits for approval").toBe("The agent's summary");
  });

  it("should plan again and keep the approval when an agent saves between the person's plan and their write", async () => {
    const page = await teamPublicArtifact();
    gaps.beforePersonWrite = async () => {
      await agentSummary(page.id, "Agent, in between");
    };
    const person = await artifacts.saveArtifactUpdate(owner, page.id, { content: "# Plan\n\nthe owner's v1" }, "person", { expectedUpdatedAt: page.updatedAt.toISOString() });

    expect(person?.savedOverAgents).toBe(true);
    const current = await row(page.id);
    expect(current.content).toBe("# Plan\n\nthe owner's v1");
    const approved = await versionContent(current.approvedVersionId);
    // The owner's save went over the agent's, so what the owner approved by saving includes the agent's summary.
    expect(approved).toEqual({ content: "# Plan\n\nthe owner's v1", summary: "Agent, in between" });
    expect(await pendingRequest(page.id), "the owner's applied save settles the agent's request").toBeNull();
  });

  it("should file an agent's edit to the team's public artifact for approval in the save's own statement", async () => {
    const page = await teamPublicArtifact();
    const saved = await agentSummary(page.id, "Agent only");
    expect(saved?.pendingEdit).not.toBeNull();
    const current = await row(page.id);
    expect((await versionContent(current.approvedVersionId))?.summary).toBe("");
    const request = await pendingRequest(page.id);
    expect(request?.requestedBy).toBe(owner);
    expect((await versionContent(request?.versionId ?? null))?.summary).toBe("Agent only");
  });
});
