import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * What one autosave costs the database (#255: "slow to save"). On
 * production every statement is its own HTTPS round trip, so a save is as
 * slow as its chain of statements is long. This runs a real save against a
 * real Postgres and holds it to a budget: how many statements it runs, how
 * many of them wait for another, and that it never reads a version's text
 * back. A change that adds a statement to the save path fails here and has
 * to say why. It runs only when TEST_DATABASE_URL names a throwaway local
 * database with the migrations applied; never point it at a shared one.
 */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(), revalidatePath: vi.fn() }));

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

/** One statement the save ran: its text, and when it started and finished, in order of start. */
interface Statement {
  text: string;
  started: number;
  finished: number;
}

/** The SQL of a query as the driver was handed it: a string, or a config object with `text`. */
function textOf(sent: unknown): string {
  if (typeof sent === "string") return sent;
  const text = typeof sent === "object" && sent !== null && "text" in sent ? sent.text : "";
  return typeof text === "string" ? text : "";
}

/** Resolves after `ms` milliseconds; at once for zero or less. */
function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** How many round trips deep the statements go: one that starts after another finished waits for it. */
function depthOf(statements: readonly Statement[]): number {
  let depth = 0;
  let waveEnds = -1;
  for (const statement of statements) {
    if (statement.started < waveEnds) continue;
    depth += 1;
    waveEnds = Math.min(...statements.filter((other) => other.started >= statement.started).map((other) => other.finished));
  }
  return depth;
}

describe.runIf(Boolean(databaseUrl))("the database work of one autosave", async () => {
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const { createArtifact, saveArtifactUpdate } = await import("@/lib/artifacts");
  const { like } = await import("drizzle-orm");

  const tag = randomUUID().slice(0, 8);
  const owner = `savebudget-${tag}-owner`;

  /**
   * How long every statement takes here, at the least. On production each
   * statement is one HTTPS round trip of about the same length, so how deep
   * a save goes is how many of them wait for another. A local database
   * answers in a millisecond or two, unevenly: when one of two chains that
   * run side by side answered faster (the rate limit's read and write beside
   * the artifact's read), its second statement started before the other
   * chain's first had finished, and `depthOf` counted one round trip more
   * than the save has (CI, 20 Nov 2026: 7 for 6). Holding each answer until
   * this long after its statement started makes every round trip the same
   * length, so the count follows what waits for what, not which answer came
   * first. That holds while every local query answers within this time, which
   * is far above a local query's one or two milliseconds; a query slower than
   * this (a cold connection on a busy runner) could still add a wave. Checked
   * by hand on 20 Nov 2026: with the artifact's read held 40 ms longer than
   * the rest, the count was 7 every time without this floor, and 6 with it.
   */
  const roundTripMs = 100;

  /** Runs `work` and returns every statement it sent, with a counter for order (the clock is too coarse for a local database). */
  async function statementsOf(work: () => Promise<unknown>): Promise<Statement[]> {
    const statements: Statement[] = [];
    let tick = 0;
    const real = Pool.prototype.query.bind(getDb().$client) as (...args: unknown[]) => Promise<unknown>;
    const spy = vi.spyOn(getDb().$client, "query").mockImplementation(((...args: unknown[]) => {
      const sent = args[0];
      const text = textOf(sent);
      const entry: Statement = { text: text.replace(/\s+/g, " "), started: (tick += 1), finished: Number.POSITIVE_INFINITY };
      statements.push(entry);
      const answersAt = performance.now() + roundTripMs;
      return real(...args)
        .then(async (answer) => {
          await wait(answersAt - performance.now());
          return answer;
        })
        .finally(() => { entry.finished = tick += 1; });
    }) as never);
    // One rate limit hit in 50 also sweeps old buckets (CLEANUP_CHANCE in rate-limit.ts): one more statement, and one more
    // round trip, on that save only. The budget is the save's own path, so the sweep never runs here.
    const sweep = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      await work();
    } finally {
      spy.mockRestore();
      sweep.mockRestore();
    }
    return statements;
  }

  beforeAll(async () => {
    await getDb().insert(user).values({ id: owner, name: owner, email: `${owner}@example.com` });
  });

  afterAll(async () => {
    await getDb().delete(artifact).where(eq(artifact.userId, owner));
    await getDb().delete(rateLimitBucket).where(like(rateLimitBucket.key, `%${owner}%`));
    await getDb().delete(user).where(eq(user.id, owner));
  });

  it("should read the latest version's text back only when it can point at uploaded files", async () => {
    const { latestVersionBeside } = await import("@/lib/versions/history");
    const plain = await createArtifact(owner, { title: "Plain", content: "# Plain\n\nWords only." });
    const spec = await createArtifact(owner, { title: "Spec", kind: "ui", content: JSON.stringify({ root: "a", elements: { a: { type: "Text", props: { text: "Hello" }, children: [] } } }) });

    expect(await latestVersionBeside({ id: plain.id, content: "# Plain\n\nWords only." })).toMatchObject({ sameContent: true, fileContent: null });
    expect(await latestVersionBeside({ id: plain.id, content: "# Plain\n\nOther words." })).toMatchObject({ sameContent: false, fileContent: null });
    expect((await latestVersionBeside({ id: spec.id, content: "" }))?.fileContent).toContain("Hello");
    // A newer version of the plain document that shows an upload: its text comes back.
    const shot = "# Plain\n\n![Shot](/api/files/00000000-0000-4000-8000-000000000001)";
    await getDb().insert(artifactVersion).values({ id: randomUUID(), artifactId: plain.id, title: "Plain", kind: "markdown", content: shot, createdBy: owner, createdAt: new Date(Date.now() + 60_000) });
    expect(await latestVersionBeside({ id: plain.id, content: shot })).toMatchObject({ sameContent: true, fileContent: shot });
    expect(await latestVersionBeside({ id: "no-such-artifact", content: "" })).toBeNull();
  });

  it("should take at most 13 statements, 6 round trips deep, and never read a version's text back when an autosave continues a session on a private document", async () => {
    const page = await createArtifact(owner, { title: "Plan", content: "# Plan\n\nFirst." });
    const first = await saveArtifactUpdate(owner, page.id, { content: "# Plan\n\nFirst, and more." }, "person", { session: "start", expectedUpdatedAt: page.updatedAt });
    if (!first) throw new Error("The first save did not land.");

    const statements = await statementsOf(() => saveArtifactUpdate(owner, page.id, { content: "# Plan\n\nFirst, and more, and more again." }, "person", { session: "continue", expectedUpdatedAt: first.artifact.updatedAt }));

    expect(statements.length).toBeLessThanOrEqual(13);
    expect(depthOf(statements)).toBeLessThanOrEqual(6);
    const versionReads = statements.filter((statement) => /^select .* from "artifact_version"/.test(statement.text));
    expect(versionReads.filter((statement) => /"content"[,\s]/.test(statement.text.split(" from ")[0] ?? "") && !statement.text.includes("sha256"))).toEqual([]);
    // The save still did its work: one version for the session, holding the latest text.
    const versions = await getDb().select({ content: artifactVersion.content }).from(artifactVersion).where(eq(artifactVersion.artifactId, page.id));
    expect(versions.map((version) => version.content).sort()).toEqual(["# Plan\n\nFirst, and more, and more again.", "# Plan\n\nFirst."].sort());
  });
});
