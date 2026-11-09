import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The proxy's artifact page check: one query answers who may read the page
 * and whether search engines may index it. The read rule must give exactly
 * canReadArtifact's answers, so these tests run it against stubbed rows for
 * every visibility, and read the generated SQL, because stubbed rows cannot
 * catch an unqualified column (the tripwire in AGENTS.md).
 */

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], queries: 0 }));

function chain(): unknown {
  const next = () => {
    mocks.queries += 1;
    // Every query must have a stubbed answer: an unexpected lookup fails the test instead of reading as "no row".
    const rows = mocks.rows.shift();
    return rows ? Promise.resolve(rows) : Promise.reject(new Error(`Unexpected query ${String(mocks.queries)}`));
  };
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "from", "where", "innerJoin", "leftJoin"]) builder[name] = () => builder;
  builder.limit = next;
  return builder;
}

vi.mock("@/db", () => ({ getDb: () => ({ select: () => chain() }) }));

const { checkArtifactPage, pageCheckQuery } = await import("./artifact-page-check");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const author = "author-1";
const established = new Date("2020-01-01T00:00:00Z");

function pageRow(visibility: "private" | "team" | "link" | "public", options: { showInSearch?: boolean; accountCreatedAt?: Date | null } = {}) {
  return { userId: author, visibility, teamId: "team-1", showInSearch: options.showInSearch ?? false, accountCreatedAt: options.accountCreatedAt === undefined ? established : options.accountCreatedAt };
}

/** A viewer lookup that records whether the proxy had to resolve the session. */
function viewer(id: string | null) {
  return vi.fn(() => Promise.resolve(id));
}

describe("checkArtifactPage", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.queries = 0;
  });

  afterEach(() => {
    // Every stubbed answer was used: no expected lookup was skipped.
    expect(mocks.rows).toEqual([]);
  });

  it("should refuse a private artifact when the visitor is signed out", async () => {
    mocks.rows = [[pageRow("private", { showInSearch: true })]];
    await expect(checkArtifactPage(publicId, viewer(null))).resolves.toEqual({ readable: false, indexable: false });
  });

  it("should refuse a private artifact when someone other than the author is signed in", async () => {
    // The agent-ownership lookup finds nothing: the viewer did not add an agent that wrote it.
    mocks.rows = [[pageRow("private")], []];
    await expect(checkArtifactPage(publicId, viewer("someone-else"))).resolves.toEqual({ readable: false, indexable: false });
  });

  it("should let the author read a private artifact and still keep it out of search engines", async () => {
    mocks.rows = [[pageRow("private", { showInSearch: true })]];
    await expect(checkArtifactPage(publicId, viewer(author))).resolves.toEqual({ readable: true, indexable: false });
  });

  it("should let the person who added the agent read its private artifact", async () => {
    mocks.rows = [[pageRow("private")], [{ id: author }]];
    await expect(checkArtifactPage(publicId, viewer("agent-owner"))).resolves.toEqual({ readable: true, indexable: false });
  });

  it("should refuse a team artifact when the visitor is signed out", async () => {
    mocks.rows = [[pageRow("team")]];
    await expect(checkArtifactPage(publicId, viewer(null))).resolves.toEqual({ readable: false, indexable: false });
  });

  it("should refuse a team artifact when the signed-in viewer is not in the team", async () => {
    // No membership row, then no agent-ownership row.
    mocks.rows = [[pageRow("team")], [], []];
    await expect(checkArtifactPage(publicId, viewer("outsider"))).resolves.toEqual({ readable: false, indexable: false });
  });

  it("should let a team member read a team artifact", async () => {
    mocks.rows = [[pageRow("team")], [{ id: "member-row" }]];
    await expect(checkArtifactPage(publicId, viewer("member-1"))).resolves.toEqual({ readable: true, indexable: false });
  });

  it("should open a link artifact to anyone without resolving the session, and never index it", async () => {
    const resolve = viewer("someone");
    mocks.rows = [[pageRow("link", { showInSearch: true })]];
    await expect(checkArtifactPage(publicId, resolve)).resolves.toEqual({ readable: true, indexable: false });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("should open a public artifact in one query without resolving the session", async () => {
    const resolve = viewer(null);
    mocks.rows = [[pageRow("public")]];
    await expect(checkArtifactPage(publicId, resolve)).resolves.toEqual({ readable: true, indexable: false });
    expect(resolve).not.toHaveBeenCalled();
    expect(mocks.queries).toBe(1);
  });

  it("should let search engines index a public artifact only when its author opted in and the account is established", async () => {
    mocks.rows = [[pageRow("public", { showInSearch: true })]];
    await expect(checkArtifactPage(publicId, viewer(null))).resolves.toEqual({ readable: true, indexable: true });
    expect(mocks.queries).toBe(1);
  });

  it("should keep an opted-in public artifact out of search engines while the account is new", async () => {
    mocks.rows = [[pageRow("public", { showInSearch: true, accountCreatedAt: new Date() })]];
    await expect(checkArtifactPage(publicId, viewer(null))).resolves.toEqual({ readable: true, indexable: false });
  });

  it("should keep an opted-in public artifact out of search engines when the account age is unknown", async () => {
    mocks.rows = [[pageRow("public", { showInSearch: true, accountCreatedAt: null })]];
    await expect(checkArtifactPage(publicId, viewer(null))).resolves.toEqual({ readable: true, indexable: false });
  });

  it("should answer not found without resolving the session when the artifact does not exist", async () => {
    const resolve = viewer("someone");
    mocks.rows = [[]];
    await expect(checkArtifactPage(publicId, resolve)).resolves.toEqual({ readable: false, indexable: false });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("should answer not found without a query when the id is malformed", async () => {
    await expect(checkArtifactPage("../../etc", viewer("someone"))).resolves.toEqual({ readable: false, indexable: false });
    expect(mocks.queries).toBe(0);
  });
});

const db = drizzle({ client: neon("postgres://user:password@db.example.com/db") });

describe("pageCheckQuery", () => {
  it("should look the artifact up by its public id when the proxy checks a page", () => {
    const { sql, params } = pageCheckQuery(db, publicId).toSQL();
    expect(sql).toContain('where "artifact"."public_id" = $1');
    expect(params[0]).toBe(publicId);
  });

  it("should qualify every join when an agent's account age comes from its owner", () => {
    const { sql } = pageCheckQuery(db, publicId).toSQL();
    expect(sql).toContain('left join "user" on "user"."id" = "artifact"."user_id"');
    expect(sql).toContain('left join "agent" on "agent"."user_id" = "user"."id"');
    expect(sql).toContain('left join "user" "owner" on "owner"."id" = "agent"."owner_id"');
    expect(sql).toContain('coalesce("owner"."created_at", "user"."created_at")');
  });

  it("should never compare a column with itself when it builds the joins", () => {
    const { sql } = pageCheckQuery(db, publicId).toSQL();
    expect(sql).not.toMatch(/"(\w+)" = "\1"(?!\.)/);
    expect(sql).not.toMatch(/"id" = "id"|"user_id" = "user_id"|"team_id" = "team_id"|"owner_id" = "owner_id"/);
  });

  it("should read only the fields the checks need, never content or titles", () => {
    const { sql } = pageCheckQuery(db, publicId).toSQL();
    const selected = sql.slice(0, sql.indexOf(" from "));
    expect(selected).toContain('"artifact"."visibility"');
    expect(selected).toContain('"artifact"."team_id"');
    expect(selected).toContain('"artifact"."show_in_search"');
    expect(selected).not.toContain('"content"');
    expect(selected).not.toContain('"title"');
    expect(selected).not.toContain('"email"');
  });
});
