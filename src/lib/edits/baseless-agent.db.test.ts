import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * An agent that sends no baseVersion, against a real Postgres. It cannot
 * know what a person saved after it read the artifact, so whenever a
 * person's save is the newest it is refused (base_version_required) for any
 * field, lease or not, and told to read the artifact and pass its
 * baseVersion. Artifacts that agents saved last keep taking saves without
 * one. The check is part of the UPDATE itself. It runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("agent saves without a base version", async () => {
  const { eq, inArray, like, sql } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactEditLease } = await import("@/db/edit-lease-schema");
  const { artifact, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const artifacts = await import("@/lib/artifacts");
  const { encodeBaseVersion } = await import("./edit-conflict-rules");
  const { renewEditLease } = await import("./agent-write-guard");

  const tag = randomUUID().slice(0, 8);
  const owner = `baseless-${tag}-owner`;
  const claude = { harness: "claude-code" as const, label: null };

  async function row(id: string) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, id)).limit(1);
    if (!found) throw new Error("No such artifact.");
    return found;
  }

  async function readBase(id: string) {
    return encodeBaseVersion({ versionId: null, updatedAt: (await row(id)).updatedAt });
  }

  /** The person's artifact after they typed and saved in the web app. */
  async function personSaved(content = "# Answers\n\nQ1: the owner's answer") {
    const page = await artifacts.createArtifact(owner, { title: "Answers", content: "# Answers\n\nQ1: " });
    const saved = await artifacts.saveArtifactUpdate(owner, page.id, { content, summary: "The owner's summary" }, "person", { expectedUpdatedAt: page.updatedAt });
    if (!saved) throw new Error("No person save.");
    return saved.artifact;
  }

  const agentUpdate = (id: string, changes: Parameters<typeof artifacts.updateArtifact>[2], baseVersion?: string) =>
    artifacts.updateArtifact(owner, id, changes, "agent", { harness: claude, ...(baseVersion === undefined ? {} : { baseVersion }) });

  beforeAll(async () => {
    await getDb().insert(user).values({ id: owner, name: owner, email: `${owner}@example.com` });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(eq(artifact.userId, owner));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%baseless-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [owner]));
  });

  it("should refuse an agent that read before the person saved, once the person stopped and the lease ended", async () => {
    // t=-30 s the agent reads; t=0 the person saves and stops typing; t=60 the lease ends; t=90 the agent updates without a base.
    const page = await personSaved();
    await renewEditLease(page.id, owner);
    await getDb().update(artifactEditLease).set({ expiresAt: sql`now() - interval '30 seconds'` }).where(eq(artifactEditLease.artifactId, page.id));

    const late = agentUpdate(page.id, { content: "# Answers\n\nQ1: what the agent read at t=-30" });
    await expect(late).rejects.toMatchObject({ code: "base_version_required" });
    expect((await row(page.id)).content).toBe("# Answers\n\nQ1: the owner's answer");
  });

  it("should refuse a change to a field no lease guards while the lease is live and a person saved last", async () => {
    const page = await personSaved();
    await renewEditLease(page.id, owner);
    await expect(agentUpdate(page.id, { summary: "The agent's summary" })).rejects.toMatchObject({ code: "base_version_required" });
    await expect(agentUpdate(page.id, { icon: "🧪" })).rejects.toMatchObject({ code: "base_version_required" });
    const current = await row(page.id);
    expect(current.summary).toBe("The owner's summary");
    expect(current.icon).toBeNull();
  });

  it("should tell the agent to read the artifact with artifacts_get and pass its baseVersion", async () => {
    const page = await personSaved();
    await expect(agentUpdate(page.id, { summary: "x" })).rejects.toThrow(/Read the artifact with artifacts_get and pass its baseVersion/);
  });

  it("should land the same change once the agent passes the base it read", async () => {
    const page = await personSaved();
    const saved = await agentUpdate(page.id, { summary: "The agent's summary" }, await readBase(page.id));
    expect(saved?.summary).toBe("The agent's summary");
    // Now an agent saved last: a later save without a base goes through again.
    expect((await agentUpdate(page.id, { summary: "Later" }))?.summary).toBe("Later");
  });

  it("should keep saving an artifact only agents touched, without a base", async () => {
    const page = await artifacts.createArtifact(owner, { title: "Agent notes", content: "# Notes" }, { harness: claude, actor: "agent" });
    expect((await agentUpdate(page.id, { content: "# Notes\n\nmore" }))?.content).toBe("# Notes\n\nmore");
    expect((await agentUpdate(page.id, { summary: "Notes" }))?.summary).toBe("Notes");
  });

  it("should refuse a restore without a base when a person saved last, with no lease", async () => {
    const page = await personSaved();
    const [first] = await getDb().select({ id: artifactVersion.id }).from(artifactVersion).where(eq(artifactVersion.artifactId, page.id)).limit(1);
    if (!first) throw new Error("No first version.");
    await expect(artifacts.restoreArtifactVersion(owner, page.id, first.id, "agent", { harness: claude })).rejects.toMatchObject({ code: "base_version_required" });
    expect((await row(page.id)).content).toBe("# Answers\n\nQ1: the owner's answer");
  });

  it("should treat a person's newest version as a person's save on a row from before person_saved_at", async () => {
    const page = await personSaved();
    // As the previous deployment left it: no person_saved_at, versions without by_agent; the newest is a web save (no harness).
    await getDb().update(artifact).set({ personSavedAt: null }).where(eq(artifact.id, page.id));
    await getDb().update(artifactVersion).set({ byAgent: null }).where(eq(artifactVersion.artifactId, page.id));
    await expect(agentUpdate(page.id, { content: "# Answers\n\nold client" })).rejects.toMatchObject({ code: "base_version_required" });
  });
});
