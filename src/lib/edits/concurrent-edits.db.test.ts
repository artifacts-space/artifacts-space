import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * A person's work wins over an agent's, against a real Postgres, for what
 * mocks cannot show: the base-version and lease checks are part of the
 * UPDATE itself, so racing saves can never both pass; a baseVersion-less
 * agent waits while a person's lease is live; a person's web save lands over
 * an agent's and both stay in History; and History never folds a web save
 * and an agent save into one version. Agents save as the person who
 * connected them, with a harness. It runs only when TEST_DATABASE_URL names a
 * throwaway local database with the migrations applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("concurrent edits with a database", async () => {
  const { asc, eq, inArray, like, sql } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactEditLease } = await import("@/db/edit-lease-schema");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const artifacts = await import("@/lib/artifacts");
  const { createArtifact, restoreArtifactVersion } = artifacts;
  const { EditConflictError } = await import("./conflict-error");
  const { encodeBaseVersion } = await import("./edit-conflict-rules");
  const { endEditLease, renewEditLease } = await import("./agent-write-guard");
  const { StaleSaveError } = await import("@/lib/save-guard");

  const tag = randomUUID().slice(0, 8);
  const owner = `edits-${tag}-owner`;
  const claude = { harness: "claude-code" as const, label: null };
  const cursor = { harness: "cursor" as const, label: null };

  /**
   * Save times have millisecond precision, so two saves in the same
   * millisecond look like one and a stale base would match. People never
   * save that fast; a local database can. Each save here starts in a new
   * millisecond, so the tests never flake on it.
   */
  const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 2));

  async function updateArtifact(...args: Parameters<typeof artifacts.updateArtifact>) {
    await nextMillisecond();
    return artifacts.updateArtifact(...args);
  }

  async function saveArtifactUpdate(...args: Parameters<typeof artifacts.saveArtifactUpdate>) {
    await nextMillisecond();
    return artifacts.saveArtifactUpdate(...args);
  }

  async function row(id: string) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, id)).limit(1);
    if (!found) throw new Error("No such artifact.");
    return found;
  }

  /** The base an agent got with what it read: the artifact's save time now. */
  async function readBase(id: string) {
    const current = await row(id);
    return encodeBaseVersion({ versionId: null, updatedAt: current.updatedAt });
  }

  async function versions(id: string) {
    return getDb()
      .select({ content: artifactVersion.content, harness: artifactVersion.harness, createdBy: artifactVersion.createdBy, saveKind: artifactVersion.saveKind })
      .from(artifactVersion)
      .where(eq(artifactVersion.artifactId, id))
      .orderBy(asc(artifactVersion.createdAt), asc(artifactVersion.id));
  }

  /** A person's new artifact, made in the web app. */
  async function personArtifact(content = "# Answers\n\nQ1: ") {
    return createArtifact(owner, { title: "Answers", content });
  }

  /** Moves every save time of the artifact back, so the next save is outside the 2-minute merge window. */
  async function ageVersions(id: string) {
    await getDb().update(artifactVersion).set({ savedAt: sql`saved_at - interval '10 minutes'`, createdAt: sql`created_at - interval '10 minutes'` }).where(eq(artifactVersion.artifactId, id));
  }

  beforeAll(async () => {
    await getDb().insert(user).values({ id: owner, name: owner, email: `${owner}@example.com` });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifactFile).where(eq(artifactFile.uploaderId, owner));
    await db.delete(artifact).where(eq(artifact.userId, owner));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%edits-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [owner]));
  });

  describe("an agent's baseVersion", () => {
    it("should refuse a stale agent save and change nothing when a person saved after the agent read it", async () => {
      const page = await personArtifact();
      const base = await readBase(page.id);
      const personSave = await updateArtifact(owner, page.id, { content: "# Answers\n\nQ1: typed by the owner" }, "person", { expectedUpdatedAt: page.updatedAt });
      const before = await versions(page.id);

      const stale = updateArtifact(owner, page.id, { content: "# Answers\n\nQ1: the agent's version" }, "agent", { harness: claude, baseVersion: base });
      await expect(stale).rejects.toBeInstanceOf(EditConflictError);
      await expect(stale).rejects.toMatchObject({ code: "artifact_changed", message: expect.stringContaining("via the web") as string });

      const after = await row(page.id);
      expect(after.content).toBe("# Answers\n\nQ1: typed by the owner");
      expect(after.updatedAt.toISOString()).toBe(personSave?.updatedAt);
      expect(after.harness, "a refused save stamps nothing").toBeNull();
      expect(await versions(page.id)).toEqual(before);
    });

    it("should let exactly one of two racing agent saves with the same base land", async () => {
      const page = await personArtifact();
      const base = await readBase(page.id);
      const results = await Promise.allSettled([
        updateArtifact(owner, page.id, { content: "# Answers\n\nfrom agent one" }, "agent", { harness: claude, baseVersion: base }),
        updateArtifact(owner, page.id, { content: "# Answers\n\nfrom agent two" }, "agent", { harness: cursor, baseVersion: base }),
      ]);
      const landed = results.filter((result) => result.status === "fulfilled");
      const refused = results.filter((result) => result.status === "rejected");
      expect(landed).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(refused[0]?.status === "rejected" ? refused[0].reason : null).toBeInstanceOf(EditConflictError);
      const winner = landed[0]?.status === "fulfilled" ? landed[0].value?.content : null;
      expect((await row(page.id)).content).toBe(winner);
      expect((await versions(page.id)).filter((version) => version.harness !== null)).toHaveLength(1);
    });

    it("should let one of a racing person save and agent save win, never both, when both started from the same base", async () => {
      const page = await personArtifact();
      const base = await readBase(page.id);
      const results = await Promise.allSettled([
        updateArtifact(owner, page.id, { content: "# Answers\n\nthe agent's" }, "agent", { harness: claude, baseVersion: base }),
        saveArtifactUpdate(owner, page.id, { content: "# Answers\n\nthe owner's" }, "person", { expectedUpdatedAt: page.updatedAt }),
      ]);
      const [agent, person] = results;
      expect(person.status, "a person's web save always lands").toBe("fulfilled");
      const stored = (await row(page.id)).content;
      if (agent.status === "fulfilled") {
        // The agent was first; the person's save went over it, and the agent's version stays in History.
        expect(stored).toBe("# Answers\n\nthe owner's");
        expect((await versions(page.id)).map((version) => version.content)).toContain("# Answers\n\nthe agent's");
      } else {
        expect(agent.reason).toBeInstanceOf(EditConflictError);
        expect(stored).toBe("# Answers\n\nthe owner's");
      }
    });

    it("should refuse a stale restore by an agent", async () => {
      const page = await personArtifact();
      const base = await readBase(page.id);
      await updateArtifact(owner, page.id, { content: "# Answers\n\nnewer" }, "person", { expectedUpdatedAt: page.updatedAt });
      const [first] = await getDb().select({ id: artifactVersion.id }).from(artifactVersion).where(eq(artifactVersion.artifactId, page.id)).orderBy(asc(artifactVersion.createdAt)).limit(1);
      if (!first) throw new Error("No first version.");
      await expect(restoreArtifactVersion(owner, page.id, first.id, "agent", { harness: claude, baseVersion: base })).rejects.toBeInstanceOf(EditConflictError);
      expect((await row(page.id)).content).toBe("# Answers\n\nnewer");
    });
  });

  describe("a person's edit lease", () => {
    it("should refuse a baseVersion-less agent write while the lease is live and accept it after the lease ends", async () => {
      const page = await personArtifact();
      await renewEditLease(page.id, owner);

      const blocked = updateArtifact(owner, page.id, { content: "# Answers\n\nold client" }, "agent", { harness: claude });
      await expect(blocked).rejects.toMatchObject({ code: "artifact_being_edited" });
      expect((await row(page.id)).content).toBe("# Answers\n\nQ1: ");

      // A careful agent that names its base still saves during the lease.
      const careful = await updateArtifact(owner, page.id, { content: "# Answers\n\ncareful agent" }, "agent", { harness: claude, baseVersion: await readBase(page.id) });
      expect(careful?.content).toBe("# Answers\n\ncareful agent");

      // A change to no guarded field (the summary) is not held by the lease.
      expect((await updateArtifact(owner, page.id, { summary: "Notes" }, "agent", { harness: claude }))?.summary).toBe("Notes");

      await getDb().update(artifactEditLease).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(artifactEditLease.artifactId, page.id));
      const after = await updateArtifact(owner, page.id, { content: "# Answers\n\nold client, later" }, "agent", { harness: claude });
      expect(after?.content).toBe("# Answers\n\nold client, later");
    });

    it("should hold a baseVersion-less agent's restore during a lease", async () => {
      const page = await personArtifact();
      const [first] = await getDb().select({ id: artifactVersion.id }).from(artifactVersion).where(eq(artifactVersion.artifactId, page.id)).limit(1);
      if (!first) throw new Error("No first version.");
      await renewEditLease(page.id, owner);
      await expect(restoreArtifactVersion(owner, page.id, first.id, "agent", { harness: claude })).rejects.toMatchObject({ code: "artifact_being_edited" });
    });

    it("should end the lease within one signal interval when an editor closes, unless another open editor signals again", async () => {
      const page = await personArtifact();
      await renewEditLease(page.id, owner);
      await endEditLease(page.id, owner);
      const secondsLeft = async () => {
        const [lease] = await getDb().select({ expiresAt: artifactEditLease.expiresAt }).from(artifactEditLease).where(eq(artifactEditLease.artifactId, page.id));
        return ((lease?.expiresAt.getTime() ?? 0) - Date.now()) / 1000;
      };
      expect(await secondsLeft()).toBeLessThanOrEqual(21);
      // The person's other tab, still typing, signals within that interval and keeps the lease.
      await renewEditLease(page.id, owner);
      expect(await secondsLeft()).toBeGreaterThan(50);
      await endEditLease(page.id, owner);
      await getDb().update(artifactEditLease).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(artifactEditLease.artifactId, page.id));
      expect((await updateArtifact(owner, page.id, { content: "# Answers\n\nold client" }, "agent", { harness: claude }))?.content).toBe("# Answers\n\nold client");
    });

    it("should renew one lease per person and artifact, from the database clock", async () => {
      const page = await personArtifact();
      await renewEditLease(page.id, owner);
      await renewEditLease(page.id, owner);
      const leases = await getDb().select({ expiresAt: artifactEditLease.expiresAt }).from(artifactEditLease).where(eq(artifactEditLease.artifactId, page.id));
      expect(leases).toHaveLength(1);
      const seconds = ((leases[0]?.expiresAt.getTime() ?? 0) - Date.now()) / 1000;
      expect(seconds).toBeGreaterThan(50);
      expect(seconds).toBeLessThanOrEqual(61);
    });
  });

  describe("a person's web save over an agent's", () => {
    it("should land the person's save and keep the agent's version as its own History entry", async () => {
      const page = await personArtifact();
      const agent = await updateArtifact(owner, page.id, { content: "# Answers\n\nQ1: the agent's draft" }, "agent", { harness: claude, baseVersion: await readBase(page.id) });
      expect(agent).not.toBeNull();

      // The person's editor started before the agent saved; its next autosave continues its session.
      const saved = await saveArtifactUpdate(owner, page.id, { content: "# Answers\n\nQ1: the owner's answer" }, "person", { expectedUpdatedAt: page.updatedAt, session: "continue" });
      expect(saved?.savedOverAgents).toBe(true);
      expect(saved?.artifact.content).toBe("# Answers\n\nQ1: the owner's answer");

      const history = await versions(page.id);
      expect(history.map((version) => [version.content, version.harness])).toEqual([
        ["# Answers\n\nQ1: ", null],
        ["# Answers\n\nQ1: the agent's draft", "claude-code"],
        ["# Answers\n\nQ1: the owner's answer", null],
      ]);
    });

    it("should land the person's save over an agent's on an artifact an agent created", async () => {
      const page = await createArtifact(owner, { title: "Agent notes", content: "# Notes\n\nfrom the agent" }, { harness: claude });
      // The person opens it in the web app; the agent saves again from what it read.
      await updateArtifact(owner, page.id, { content: "# Notes\n\nthe agent's second pass" }, "agent", { harness: claude, baseVersion: await readBase(page.id) });
      const saved = await saveArtifactUpdate(owner, page.id, { content: "# Notes\n\nthe owner's edit" }, "person", { expectedUpdatedAt: page.updatedAt });
      expect(saved?.savedOverAgents).toBe(true);
      // The agent's quick second pass folds into its own first version; the person's save stands apart.
      expect((await versions(page.id)).map((version) => [version.content, version.harness])).toEqual([
        ["# Notes\n\nthe agent's second pass", "claude-code"],
        ["# Notes\n\nthe owner's edit", null],
      ]);
      // From now on a person has saved it, so another person's stale tab is refused as before.
      await expect(saveArtifactUpdate(owner, page.id, { content: "# Notes\n\nstale tab" }, "person", { expectedUpdatedAt: page.updatedAt })).rejects.toBeInstanceOf(StaleSaveError);
    });

    it("should still refuse a web save over another person's newer save", async () => {
      const page = await personArtifact();
      await updateArtifact(owner, page.id, { content: "# Answers\n\nfrom the owner's other tab" }, "person", { expectedUpdatedAt: page.updatedAt });
      await expect(saveArtifactUpdate(owner, page.id, { content: "# Answers\n\nstale tab" }, "person", { expectedUpdatedAt: page.updatedAt })).rejects.toBeInstanceOf(StaleSaveError);
      expect((await row(page.id)).content).toBe("# Answers\n\nfrom the owner's other tab");
    });

    it("should refuse a web save over a person's save that came after an agent's", async () => {
      const page = await personArtifact();
      await updateArtifact(owner, page.id, { content: "# Answers\n\nagent" }, "agent", { harness: claude, baseVersion: await readBase(page.id) });
      const other = await row(page.id);
      await updateArtifact(owner, page.id, { content: "# Answers\n\nother tab" }, "person", { expectedUpdatedAt: other.updatedAt.toISOString() });
      await expect(saveArtifactUpdate(owner, page.id, { content: "# Answers\n\nstale tab" }, "person", { expectedUpdatedAt: page.updatedAt })).rejects.toBeInstanceOf(StaleSaveError);
    });

    it("should report no agent save when the person's base is current", async () => {
      const page = await personArtifact();
      const saved = await saveArtifactUpdate(owner, page.id, { content: "# Answers\n\nQ1: plain" }, "person", { expectedUpdatedAt: page.updatedAt });
      expect(saved?.savedOverAgents).toBe(false);
    });
  });

  describe("uploads of a refused save", () => {
    /** A ready upload of the owner's, not attached to any artifact yet. */
    async function upload() {
      const id = randomUUID();
      await getDb().insert(artifactFile).values({ id, uploaderId: owner, key: `files/${id}/shot.png`, filename: "shot.png", contentType: "image/png", size: 10, status: "ready" });
      return id;
    }

    async function attachedTo(fileId: string) {
      const [file] = await getDb().select({ artifactId: artifactFile.artifactId }).from(artifactFile).where(eq(artifactFile.id, fileId)).limit(1);
      return file?.artifactId ?? null;
    }

    const embed = (fileId: string) => `# Answers\n\n![Screenshot](/api/files/${fileId})\n`;

    it("should leave a refused web save's content media and cover unattached", async () => {
      const page = await personArtifact();
      await updateArtifact(owner, page.id, { content: "# Answers\n\nfrom the owner's other tab" }, "person", { expectedUpdatedAt: page.updatedAt });
      const [shot, cover] = [await upload(), await upload()];
      const stale = saveArtifactUpdate(owner, page.id, { content: embed(shot), cover: `file:${cover}` }, "person", { expectedUpdatedAt: page.updatedAt });
      await expect(stale).rejects.toBeInstanceOf(StaleSaveError);
      expect(await attachedTo(shot)).toBeNull();
      expect(await attachedTo(cover)).toBeNull();
    });

    it("should attach only the winning agent's upload when two agents race with the same base", async () => {
      const page = await personArtifact();
      const base = await readBase(page.id);
      const [first, second] = [await upload(), await upload()];
      const results = await Promise.allSettled([
        updateArtifact(owner, page.id, { content: embed(first) }, "agent", { harness: claude, baseVersion: base }),
        updateArtifact(owner, page.id, { content: embed(second) }, "agent", { harness: cursor, baseVersion: base }),
      ]);
      const [winner, loser] = results[0].status === "fulfilled" ? [first, second] : [second, first];
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await attachedTo(winner)).toBe(page.id);
      expect(await attachedTo(loser), "the refused save attached nothing").toBeNull();
    });
  });

  describe("History merging", () => {
    it("should never fold an agent's quick save into the person's web version", async () => {
      const page = await personArtifact();
      await ageVersions(page.id);
      const web = await updateArtifact(owner, page.id, { content: "# Answers\n\nweb one" }, "person", { expectedUpdatedAt: page.updatedAt });
      if (!web) throw new Error("No web save.");
      await updateArtifact(owner, page.id, { content: "# Answers\n\nagent right after" }, "agent", { harness: claude, baseVersion: encodeBaseVersion({ versionId: null, updatedAt: web.updatedAt }) });
      expect((await versions(page.id)).slice(1).map((version) => version.harness)).toEqual([null, "claude-code"]);
    });

    it("should never fold a person's quick web save into an agent's version", async () => {
      const page = await personArtifact();
      await ageVersions(page.id);
      await updateArtifact(owner, page.id, { content: "# Answers\n\nagent first" }, "agent", { harness: claude, baseVersion: await readBase(page.id) });
      const current = await row(page.id);
      await updateArtifact(owner, page.id, { content: "# Answers\n\nweb right after" }, "person", { expectedUpdatedAt: current.updatedAt.toISOString(), session: "continue" });
      expect((await versions(page.id)).slice(1).map((version) => [version.content, version.harness])).toEqual([
        ["# Answers\n\nagent first", "claude-code"],
        ["# Answers\n\nweb right after", null],
      ]);
    });

    it("should never fold saves from two different agent harnesses into one version", async () => {
      const page = await personArtifact();
      await ageVersions(page.id);
      await updateArtifact(owner, page.id, { content: "# Answers\n\nclaude" }, "agent", { harness: claude });
      await updateArtifact(owner, page.id, { content: "# Answers\n\ncursor" }, "agent", { harness: cursor });
      expect((await versions(page.id)).slice(1).map((version) => version.harness)).toEqual(["claude-code", "cursor"]);
    });

    it("should still fold quick saves from the same source into one version", async () => {
      const page = await personArtifact();
      await ageVersions(page.id);
      await updateArtifact(owner, page.id, { content: "# Answers\n\nagent one" }, "agent", { harness: claude });
      await updateArtifact(owner, page.id, { content: "# Answers\n\nagent two" }, "agent", { harness: claude });
      const afterAgent = await versions(page.id);
      expect(afterAgent.slice(1).map((version) => version.content)).toEqual(["# Answers\n\nagent two"]);
    });

    it("should never relabel a web version with an agent's harness when the agent's save changes nothing", async () => {
      const page = await personArtifact();
      await updateArtifact(owner, page.id, { content: "# Answers\n\nsame" }, "person", { expectedUpdatedAt: page.updatedAt });
      await updateArtifact(owner, page.id, { content: "# Answers\n\nsame" }, "agent", { harness: claude });
      const history = await versions(page.id);
      expect(history.at(-1)?.harness).toBeNull();
    });
  });
});
