import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type * as AgentWriteGuard from "./agent-write-guard";
import type * as VersionService from "@/lib/versions/service";

/*
 * What a save does after its UPDATE, against a real Postgres: filing its
 * version and applying the approval rule run as separate statements, and a
 * newer save can land in between. These tests slow those steps down on
 * purpose (as a slow network would on neon-http) and check that History's
 * newest version and the approved version still show what the artifact
 * shows. They also cover save times from the database clock, the SQL lease
 * guard on its own, who saved a version (`by_agent`), and uploads attached
 * in the save's own statement. It runs only when TEST_DATABASE_URL names a
 * throwaway local database with the migrations applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const slow = vi.hoisted(() => ({ agentFilingMs: 0, skipLeasePrecheck: false, filingStarted: (): void => undefined }));

// An agent's steps after its UPDATE (filing its version, approval) take as long as the test says.
// `filingStarted` fires once the agent's UPDATE has landed, so a test can act in that window without guessing a delay.
vi.mock("@/lib/versions/service", async (importOriginal) => {
  const real = await importOriginal<typeof VersionService>();
  return {
    ...real,
    recordArtifactSave: async (save: Parameters<typeof real.recordArtifactSave>[0]) => {
      if (save.actor === "agent" && save.before && slow.agentFilingMs > 0) {
        slow.filingStarted();
        await new Promise((resolve) => setTimeout(resolve, slow.agentFilingMs));
      }
      return real.recordArtifactSave(save);
    },
  };
});

// The pre-check's lease read can say "no lease" while one is live, so only the UPDATE's own guard decides.
vi.mock("./agent-write-guard", async (importOriginal) => {
  const real = await importOriginal<typeof AgentWriteGuard>();
  return { ...real, hasLiveLease: (artifactId: string) => (slow.skipLeasePrecheck ? Promise.resolve(false) : real.hasLiveLease(artifactId)) };
});

describe.runIf(Boolean(databaseUrl))("save order with a database", async () => {
  const { and, asc, desc, eq, inArray, like, sql } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactEditLease } = await import("@/db/edit-lease-schema");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const artifacts = await import("@/lib/artifacts");
  const { EditConflictError } = await import("./conflict-error");
  const { encodeBaseVersion } = await import("./edit-conflict-rules");
  const { renewEditLease } = await import("./agent-write-guard");
  const { StaleSaveError } = await import("@/lib/save-guard");

  const tag = randomUUID().slice(0, 8);
  const owner = `order-${tag}-owner`;
  const claude = { harness: "claude-code" as const, label: null };
  /** Resolves once a slowed agent save's UPDATE has landed and its filing has begun. */
  const agentUpdateLanded = () => new Promise<void>((resolve) => { slow.filingStarted = resolve; });

  async function row(id: string) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, id)).limit(1);
    if (!found) throw new Error("No such artifact.");
    return found;
  }

  async function readBase(id: string) {
    return encodeBaseVersion({ versionId: null, updatedAt: (await row(id)).updatedAt });
  }

  async function newestVersion(id: string) {
    const [found] = await getDb().select().from(artifactVersion).where(eq(artifactVersion.artifactId, id)).orderBy(desc(artifactVersion.createdAt), desc(artifactVersion.id)).limit(1);
    return found;
  }

  async function versions(id: string) {
    return getDb()
      .select({ content: artifactVersion.content, harness: artifactVersion.harness, byAgent: artifactVersion.byAgent })
      .from(artifactVersion)
      .where(eq(artifactVersion.artifactId, id))
      .orderBy(asc(artifactVersion.createdAt), asc(artifactVersion.id));
  }

  /** A person's artifact whose first version is old enough that the next save files its own. */
  async function personArtifact(content = "# Answers\n\nQ1: ") {
    const page = await artifacts.createArtifact(owner, { title: "Answers", content });
    await getDb().update(artifactVersion).set({ savedAt: sql`saved_at - interval '10 minutes'`, createdAt: sql`created_at - interval '10 minutes'` }).where(eq(artifactVersion.artifactId, page.id));
    return page;
  }

  beforeAll(async () => {
    await getDb().insert(user).values({ id: owner, name: owner, email: `${owner}@example.com` });
  });

  afterEach(() => {
    slow.agentFilingMs = 0;
    slow.skipLeasePrecheck = false;
    slow.filingStarted = () => undefined;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifactFile).where(eq(artifactFile.uploaderId, owner));
    await db.delete(artifact).where(eq(artifact.userId, owner));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%order-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [owner]));
  });

  describe("a person's save landing while an agent's save is still filing its version", () => {
    it("should keep the person's save as History's newest and approved version on a public artifact", async () => {
      const page = await personArtifact();
      await getDb().update(artifact).set({ visibility: "public" }).where(eq(artifact.id, page.id));
      slow.agentFilingMs = 150;
      const landed = agentUpdateLanded();
      const agent = artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nthe agent's" }, "agent", { harness: claude, baseVersion: await readBase(page.id) });
      await landed;
      const person = await artifacts.saveArtifactUpdate(owner, page.id, { content: "# Answers\n\nthe owner's" }, "person", { expectedUpdatedAt: page.updatedAt });
      await agent;

      expect(person?.savedOverAgents).toBe(true);
      const current = await row(page.id);
      expect(current.content).toBe("# Answers\n\nthe owner's");
      expect((await newestVersion(page.id))?.content, "History's newest version shows what the artifact shows").toBe("# Answers\n\nthe owner's");
      const [approved] = current.approvedVersionId ? await getDb().select().from(artifactVersion).where(eq(artifactVersion.id, current.approvedVersionId)) : [];
      expect(approved?.content, "readers outside the team see the person's save").toBe("# Answers\n\nthe owner's");
      // The agent's save is still in History, before the person's. (The person's save may also have pinned a snapshot
      // of it as the approved state it replaced, dated at the agent's save.)
      const history = (await versions(page.id)).map((version) => version.content);
      expect(history.at(-1)).toBe("# Answers\n\nthe owner's");
      expect(history.slice(0, -1)).toContain("# Answers\n\nthe agent's");
    });

    it("should never fold a slow agent save's older content over a newer save from the same agent", async () => {
      const page = await personArtifact();
      const base = await readBase(page.id);
      slow.agentFilingMs = 150;
      const landed = agentUpdateLanded();
      const first = artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nfirst pass" }, "agent", { harness: claude, baseVersion: base });
      await landed;
      slow.agentFilingMs = 0;
      await artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nsecond pass" }, "agent", { harness: claude, baseVersion: await readBase(page.id) });
      await first;
      expect((await row(page.id)).content).toBe("# Answers\n\nsecond pass");
      expect((await newestVersion(page.id))?.content).toBe("# Answers\n\nsecond pass");
    });
  });

  describe("save times from the database clock", () => {
    it("should give every save a later millisecond than the one before, even after a save stamped ahead of the clock", async () => {
      const page = await personArtifact();
      // A save stamped ten seconds ahead (an older server with a fast clock).
      await getDb().update(artifact).set({ updatedAt: sql`date_trunc('milliseconds', now() + interval '10 seconds')` }).where(eq(artifact.id, page.id));
      const ahead = (await row(page.id)).updatedAt;
      const next = await artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nnext" }, "agent", { harness: claude, baseVersion: encodeBaseVersion({ versionId: null, updatedAt: ahead }) });
      expect(Date.parse(next?.updatedAt ?? "")).toBe(ahead.getTime() + 1);
      // The base of the save ahead now names nothing current, so an agent holding it is refused.
      await expect(artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nstale" }, "agent", { harness: claude, baseVersion: encodeBaseVersion({ versionId: null, updatedAt: ahead }) })).rejects.toBeInstanceOf(EditConflictError);
    });

    it("should refuse a person's base later than the artifact's last save, which no server handed out", async () => {
      const page = await personArtifact();
      await artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nother person" }, "person", { expectedUpdatedAt: page.updatedAt });
      const future = new Date(Date.now() + 60_000).toISOString();
      await expect(artifacts.saveArtifactUpdate(owner, page.id, { content: "# Answers\n\ncrafted" }, "person", { expectedUpdatedAt: future })).rejects.toBeInstanceOf(StaleSaveError);
      expect((await row(page.id)).content).toBe("# Answers\n\nother person");
    });
  });

  describe("the lease guard in the UPDATE itself", () => {
    it("should refuse a baseVersion-less agent when a lease went live after its pre-check", async () => {
      const page = await personArtifact();
      await renewEditLease(page.id, owner);
      slow.skipLeasePrecheck = true;
      await expect(artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nold client" }, "agent", { harness: claude })).rejects.toMatchObject({ code: "artifact_being_edited" });
      expect((await row(page.id)).content).toBe("# Answers\n\nQ1: ");
    });

    it("should let a lease or a person's version on another artifact change nothing", async () => {
      const held = await personArtifact();
      const other = await personArtifact();
      await renewEditLease(held.id, owner);
      expect((await artifacts.updateArtifact(owner, other.id, { content: "# Answers\n\nfree" }, "agent", { harness: claude }))?.content).toBe("# Answers\n\nfree");
      // A person's newer web version of the held artifact never refuses a save over agents on the other one.
      await artifacts.updateArtifact(owner, held.id, { content: "# Answers\n\nperson on held" }, "person", { expectedUpdatedAt: held.updatedAt });
      const otherNow = await row(other.id);
      await getDb().update(artifact).set({ personSavedAt: null }).where(eq(artifact.id, other.id));
      const saved = await artifacts.saveArtifactUpdate(owner, other.id, { content: "# Answers\n\nmine" }, "person", { expectedUpdatedAt: other.updatedAt });
      expect(saved?.savedOverAgents).toBe(true);
      expect(otherNow.content).toBe("# Answers\n\nfree");
    });
  });

  describe("who saved a version", () => {
    it("should keep an agent's save with no known harness apart from the person's web version, and count it as an agent's", async () => {
      const page = await personArtifact();
      const web = await artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nweb" }, "person", { expectedUpdatedAt: page.updatedAt });
      if (!web) throw new Error("No web save.");
      await artifacts.updateArtifact(owner, page.id, { content: "# Answers\n\nagent, harness unknown" }, "agent", { harness: null, baseVersion: encodeBaseVersion({ versionId: null, updatedAt: web.updatedAt }) });
      expect((await versions(page.id)).slice(1)).toEqual([
        { content: "# Answers\n\nweb", harness: null, byAgent: false },
        { content: "# Answers\n\nagent, harness unknown", harness: null, byAgent: true },
      ]);
      // A person's tab based on the web save goes over it: it was an agent's save.
      const saved = await artifacts.saveArtifactUpdate(owner, page.id, { content: "# Answers\n\nmine" }, "person", { expectedUpdatedAt: web.updatedAt });
      expect(saved?.savedOverAgents).toBe(true);
    });

    it("should record a person's own create as a person's version and an agent's create as an agent's", async () => {
      const mine = await artifacts.createArtifact(owner, { title: "Mine", content: "# Mine" });
      const theirs = await artifacts.createArtifact(owner, { title: "Theirs", content: "# Theirs" }, { harness: null, actor: "agent" });
      expect((await versions(mine.id)).map((version) => version.byAgent)).toEqual([false]);
      expect((await versions(theirs.id)).map((version) => version.byAgent)).toEqual([true]);
      expect((await row(theirs.id)).personSavedAt).toBeNull();
    });
  });

  describe("uploads in the save's own statement", () => {
    async function upload() {
      const id = randomUUID();
      await getDb().insert(artifactFile).values({ id, uploaderId: owner, key: `files/${id}/shot.png`, filename: "shot.png", contentType: "image/png", size: 10, status: "ready" });
      return id;
    }

    it("should attach content media as content media and a cover as a plain file when the save lands", async () => {
      const page = await personArtifact();
      const [shot, cover] = [await upload(), await upload()];
      await artifacts.updateArtifact(owner, page.id, { content: `# Answers\n\n![Shot](/api/files/${shot})\n`, cover: `file:${cover}` }, "person", { expectedUpdatedAt: page.updatedAt });
      const files = await getDb().select({ id: artifactFile.id, artifactId: artifactFile.artifactId, byContent: artifactFile.attachedByContent }).from(artifactFile).where(and(inArray(artifactFile.id, [shot, cover])));
      expect(new Map(files.map((file) => [file.id, [file.artifactId, file.byContent]]))).toEqual(new Map([[shot, [page.id, true]], [cover, [page.id, false]]]));
    });

    it("should attach nothing when a lease refuses the save in its UPDATE", async () => {
      const page = await personArtifact();
      const shot = await upload();
      await renewEditLease(page.id, owner);
      slow.skipLeasePrecheck = true;
      await expect(artifacts.updateArtifact(owner, page.id, { content: `# Answers\n\n![Shot](/api/files/${shot})\n` }, "agent", { harness: claude })).rejects.toBeInstanceOf(EditConflictError);
      const [file] = await getDb().select({ artifactId: artifactFile.artifactId }).from(artifactFile).where(eq(artifactFile.id, shot));
      expect(file?.artifactId).toBeNull();
      await getDb().delete(artifactEditLease).where(eq(artifactEditLease.artifactId, page.id));
    });
  });
});
