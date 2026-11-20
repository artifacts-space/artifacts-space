import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * "Agents need the full data model" (the owner, 2026-11-20): what an MCP
 * result tells an agent about who wrote, saved, resolved, and approved
 * something, what the caller may do, and where it lives, through the real
 * MCP server against a real Postgres. Each fact some callers may not see is
 * checked from the side of one who may not: a signed-in reader of a public
 * artifact outside its team, who is served its approved version, and a
 * member of another team. It runs only when TEST_DATABASE_URL names a
 * throwaway local database with the migrations applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_URL ??= "https://artifacts.test";
}

vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof NextCache>()), cacheLife: () => undefined, cacheTag: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("@/lib/comments/mention-email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendMentionEmail: vi.fn() }));

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

type Json = Record<string, unknown>;
interface Actor { handle: string | null; kind: string; name?: { untrustedText: string }; for?: { untrustedText: string } }
interface ReadArtifact extends Json { can: string[]; author: Actor | null; updatedBy: Actor | null; firstAuthor?: Actor; home?: string; files: Json[]; content?: string; version?: string }
interface ReadComment extends Json { id: string; author: Actor | null; quote: { untrustedText: string } | null; quotePrefix?: { untrustedText: string }; quoteSuffix?: { untrustedText: string }; resolved: { at: string; by: Actor | null } | null; onTextThatChanged: boolean }
interface Member { handle: string; kind: string; name: { untrustedText: string }; roleKey?: string; customRoleName?: { untrustedText: string }; joinedAt?: string; for?: { untrustedText: string }; muted?: true }
interface ListedTeam { slug: string; role: string; roleKey: string; roleName?: string; capabilities: string[]; members?: Member[] }
interface Teams { you: Member; teams: ListedTeam[] }

/** What each tool the tests call returns. artifacts_versions is a list, or one version with `version`. */
interface Results {
  artifacts_get: ReadArtifact;
  artifacts_list: ReadArtifact[];
  comments_list: { artifact: { threadUrl: string }; comments: ReadComment[] };
  teams_list: Teams;
  artifacts_versions: Json[] & Json;
  inbox_list: { unread: number; mentions: Json[] };
  inbox_mark_read: Json;
}

describe.runIf(Boolean(databaseUrl))("the full data model over MCP", async () => {
  const { inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { teamRole, teamRoleAssignment } = await import("@/db/roles-schema");
  const { agent, artifact, artifactFile, artifactVersion, comment, mention, rateLimitBucket, sharingRequest, team, teamMember, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { seedBuiltInRoles } = await import("@/lib/teams/role-store");
  const { registerAllTools } = await import("./register-tools");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `fulldata-${tag}-${name}`;
  const handle = (name: string) => `${name}-${tag}`;
  const ids = { owner: id("owner"), ada: id("ada"), bob: id("bob"), bot: id("bot"), outsider: id("outsider"), former: id("former"), crew: id("crew"), press: id("press"), home: id("home") };
  const people = [ids.owner, ids.ada, ids.bob, ids.bot, ids.outsider, ids.former];
  const doc = { id: randomUUID(), publicId: generatePublicId(), approved: randomUUID(), latest: randomUUID() };
  const files = { chart: randomUUID(), sow: randomUUID() };
  const comments = { onApproved: randomUUID(), onLatest: randomUUID(), reply: randomUUID() };
  const clients: Client[] = [];
  const chart = `![Chart](/api/files/${files.chart})`;
  const approvedText = `# Plan\n\nWe ship the beta on Friday.\n\n${chart}\n`;
  const latestText = `# Plan\n\nWe ship the gamma on Friday.\n\n${chart}\n`;

  async function connect(userId: string) {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllTools(server, userId, "full", () => Promise.resolve({ harness: "claude-code" as const, label: null }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    clients.push(client);
    return async <Name extends keyof Results>(name: Name, args: Record<string, unknown>) => {
      const result = (await client.callTool({ name, arguments: args })) as ToolResult;
      const text = result.content[0]?.text ?? "";
      if (result.isError) throw new Error(`${name} failed: ${text}`);
      return { text, json: JSON.parse(text) as Results[Name] };
    };
  }

  /** Every SQL statement a tool call sends, counted at the driver. */
  async function statementsOf(work: () => Promise<unknown>): Promise<number> {
    let count = 0;
    const client = getDb().$client;
    const real = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
    const spy = vi.spyOn(client, "query").mockImplementation(((...args: unknown[]) => {
      count += 1;
      return real(...args);
    }) as never);
    try {
      await work();
    } finally {
      spy.mockRestore();
    }
    return count;
  }

  beforeAll(async () => {
    const db = getDb();
    const at = (minutes: number) => new Date(Date.now() - (60 - minutes) * 60_000);
    await db.insert(user).values([
      { id: ids.owner, name: "Owner Person", email: `${ids.owner}@example.com`, username: handle("owner"), usernameConfirmed: true },
      { id: ids.ada, name: "Ada Lovelace", email: `${ids.ada}@example.com`, username: handle("ada"), usernameConfirmed: true },
      { id: ids.bob, name: "Bob Builder", email: `${ids.bob}@example.com`, username: handle("bob"), usernameConfirmed: true },
      { id: ids.outsider, name: "Olga Outside", email: `${ids.outsider}@example.com`, username: handle("outsider"), usernameConfirmed: true },
      { id: ids.former, name: "Fern Former", email: `${ids.former}@example.com`, username: handle("former"), usernameConfirmed: true },
      { id: ids.bot, name: "Crew Bot", email: `agent-${ids.bot}@agents.artifacts.invalid`, username: handle("bot"), usernameConfirmed: true },
    ]);
    await db.insert(team).values([
      { id: ids.crew, name: "Crew", slug: ids.crew, personal: false },
      { id: ids.press, name: "Press", slug: ids.press, personal: false },
      { id: ids.home, name: "Home", slug: ids.home, personal: true, createdBy: ids.owner },
    ]);
    await seedBuiltInRoles(ids.crew);
    await db.insert(teamMember).values([
      { id: id("m-home"), teamId: ids.home, userId: ids.owner, role: "owner" },
      { id: id("m-owner"), teamId: ids.crew, userId: ids.owner, role: "owner" },
      { id: id("m-ada"), teamId: ids.crew, userId: ids.ada, role: "admin" },
      { id: id("m-bob"), teamId: ids.crew, userId: ids.bob, role: "member" },
      { id: id("m-bot"), teamId: ids.crew, userId: ids.bot, role: "member" },
      { id: id("m-outsider"), teamId: ids.press, userId: ids.outsider, role: "owner" },
    ]);
    const reviewer = randomUUID();
    await db.insert(teamRole).values({ id: reviewer, teamId: ids.crew, key: "reviewer", name: "Reviewer", builtIn: false });
    await db.insert(teamRoleAssignment).values({ memberId: id("m-bob"), roleId: reviewer });
    await db.insert(agent).values({ userId: ids.bot, teamId: ids.crew, ownerId: ids.owner, mutedAt: new Date(), mutedBy: ids.owner });

    // A public plan the owner took over from a member who left. Readers outside the team see the approved version (beta); the team works on gamma.
    await db.insert(artifact).values({
      id: doc.id, publicId: doc.publicId, userId: ids.owner, originalAuthorId: ids.former, updatedBy: ids.bot, kind: "markdown", title: "Plan", content: latestText,
      visibility: "public", teamId: ids.crew, comments: "signed_in", shareId: randomUUID().replaceAll("-", ""), updatedAt: at(40),
    });
    await db.insert(artifactVersion).values([
      { id: doc.approved, artifactId: doc.id, title: "Plan", kind: "markdown", content: approvedText, createdBy: ids.ada, createdAt: at(10), savedAt: at(10), saveKind: "edit" },
      { id: doc.latest, artifactId: doc.id, title: "Plan", kind: "markdown", content: latestText, createdBy: ids.bot, createdAt: at(40), savedAt: at(40), saveKind: "edit" },
    ]);
    await db.update(artifact).set({ approvedVersionId: doc.approved }).where(inArray(artifact.id, [doc.id]));
    await db.insert(sharingRequest).values([
      { id: randomUUID(), artifactId: doc.id, teamId: ids.crew, requestedBy: ids.ada, kind: "edit", visibility: "public", versionId: doc.approved, status: "approved", decidedBy: ids.owner, decidedAt: at(12), createdAt: at(11) },
      { id: randomUUID(), artifactId: doc.id, teamId: ids.crew, requestedBy: ids.bot, kind: "edit", visibility: "public", versionId: doc.latest, status: "pending", createdAt: at(40) },
    ]);
    await db.insert(artifactFile).values([
      { id: files.chart, uploaderId: ids.owner, artifactId: doc.id, key: `files/${files.chart}/chart.png`, filename: "chart.png", contentType: "image/png", size: 2048, status: "ready", attachedAt: at(1), attachedByContent: true, width: 800, height: 600, createdAt: at(1) },
      { id: files.sow, uploaderId: ids.owner, artifactId: doc.id, key: `files/${files.sow}/sow.pdf`, filename: "sow.pdf", contentType: "application/pdf", size: 4096, status: "ready", attachedAt: at(1), replacedAt: at(5), createdAt: at(1) },
    ]);
    // Inline comments on words of each version, with surrounding text that is in neither: what readers get must come from the text they are served.
    await db.insert(comment).values([
      { id: comments.onApproved, artifactId: doc.id, authorId: ids.ada, body: "Is beta right?", quote: "beta", quotePrefix: "STORED-BEFORE ", quoteSuffix: " STORED-AFTER", resolvedAt: at(30), resolvedBy: ids.owner, createdAt: at(20) },
      { id: comments.onLatest, artifactId: doc.id, authorId: ids.bot, body: "Gamma reads better.", quote: "gamma", quotePrefix: "We ship the ", quoteSuffix: " on Friday.", createdAt: at(41) },
      { id: comments.reply, artifactId: doc.id, authorId: ids.outsider, parentId: comments.onApproved, body: "Agreed.", createdAt: at(42) },
    ]);
    await db.insert(mention).values({ id: randomUUID(), commentId: comments.onApproved, artifactId: doc.id, recipientId: ids.bob, actorId: ids.ada, createdAt: at(20) });
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    const db = getDb();
    const owned = (await db.select({ id: artifact.id }).from(artifact).where(inArray(artifact.userId, people))).map((row) => row.id);
    if (owned.length > 0) {
      await db.delete(mention).where(inArray(mention.artifactId, owned));
      await db.delete(comment).where(inArray(comment.artifactId, owned));
      await db.delete(sharingRequest).where(inArray(sharingRequest.artifactId, owned));
      await db.delete(artifactFile).where(inArray(artifactFile.artifactId, owned));
      await db.update(artifact).set({ approvedVersionId: null }).where(inArray(artifact.id, owned));
      await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, owned));
      await db.delete(artifact).where(inArray(artifact.id, owned));
    }
    await db.delete(agent).where(inArray(agent.userId, people));
    // Teams go whole, with their roles and members.
    await db.delete(team).where(inArray(team.id, [ids.crew, ids.press, ids.home]));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%fulldata-${tag}-%`));
    await db.delete(user).where(inArray(user.id, people));
  });

  it("should tell a teammate who wrote, wrote first, and saved the artifact, with names, what they may do, where it lives, and each file's facts", async () => {
    const call = await connect(ids.bob);
    const { json } = await call("artifacts_get", { id: doc.publicId });

    expect(json.version).toBe("latest");
    expect(json.author).toEqual({ handle: handle("owner"), kind: "person", name: { untrustedText: "Owner Person" } });
    // The member who left is no teammate any more: their handle, not their name.
    expect(json.firstAuthor).toEqual({ handle: handle("former"), kind: "person" });
    expect(json.updatedBy).toEqual({ handle: handle("bot"), kind: "agent", name: { untrustedText: "Crew Bot" }, for: { untrustedText: "Owner Person" } });
    expect(json.can).toEqual(["edit", "comment"]);
    expect(json.home).toBe("team");
    expect(json.team).toBe(ids.crew);
    expect(json.files).toEqual([
      expect.objectContaining({ id: files.chart, width: 800, height: 600, embedded: true, createdAt: expect.any(String) as unknown }),
      expect.objectContaining({ id: files.sow, replacedAt: expect.any(String) as unknown }),
    ]);
  });

  it("should let the author share and delete as well", async () => {
    const call = await connect(ids.owner);
    expect((await call("artifacts_get", { id: doc.publicId })).json.can).toEqual(["edit", "share", "comment", "delete"]);
  });

  it("should give a signed-in reader outside the team the byline the page shows and nothing an editor alone reads", async () => {
    const call = await connect(ids.outsider);
    const { json, text } = await call("artifacts_get", { id: doc.publicId });

    expect(json.version).toBe("approved");
    expect(json.content).toContain("beta");
    expect(text).not.toContain("gamma");
    // The page's label: handles, and an agent's owner. No name of someone with a handle, no first author, no home, no team.
    expect(json.author).toEqual({ handle: handle("owner"), kind: "person" });
    expect(json.updatedBy).toEqual({ handle: handle("ada"), kind: "person" });
    expect(json).not.toHaveProperty("firstAuthor");
    expect(json).not.toHaveProperty("home");
    expect(json.team).toBeNull();
    expect(json.can).toEqual(["comment"]);
    expect(text).not.toContain(handle("former"));
    expect(text).not.toContain("Ada Lovelace");
    expect(text).not.toMatch(/"embedded"|"pictured"/);
    expect(text).not.toContain("@example.com");
  });

  it("should list each artifact with the same identity and rights as a read, in a fixed number of statements whatever the number of items", async () => {
    const call = await connect(ids.bob);
    const listed = (await call("artifacts_list", { scope: ids.crew })).json.find((item) => item.id === doc.publicId);
    expect(listed).toMatchObject({ can: ["edit", "comment"], home: "team", author: { handle: handle("owner"), kind: "person" }, firstAuthor: { handle: handle("former"), kind: "person" } });
    expect(listed?.author).not.toHaveProperty("name");
    expect(listed?.files).toEqual([
      { id: files.chart, filename: "chart.png", contentType: "image/png", size: 2048 },
      { id: files.sow, filename: "sow.pdf", contentType: "application/pdf", size: 4096 },
    ]);

    const one = await statementsOf(() => call("artifacts_list", { scope: ids.crew }));
    const more = await Promise.all(["Two", "Three", "Four"].map((title, index) => getDb().insert(artifact).values({
      id: randomUUID(), publicId: generatePublicId(), userId: [ids.ada, ids.bob, ids.bot][index] ?? ids.ada, updatedBy: ids.owner, kind: "markdown", title, content: `# ${title}`,
      visibility: "team", teamId: ids.crew, comments: "team", shareId: randomUUID().replaceAll("-", ""),
    }).returning()));
    expect(more).toHaveLength(3);
    const four = await statementsOf(() => call("artifacts_list", { scope: ids.crew }));
    expect(four).toBe(one);
  });

  it("should give a teammate the quotes, the text around them, and names, and say who resolved a thread and when", async () => {
    const call = await connect(ids.bob);
    const { json } = await call("comments_list", { artifact: doc.publicId });
    const byId = new Map(json.comments.map((item) => [item.id, item]));

    expect(json.artifact.threadUrl).toContain(`artifact=${doc.publicId}`);
    expect(byId.get(comments.onLatest)).toMatchObject({ quote: { untrustedText: "gamma" }, quotePrefix: { untrustedText: "We ship the " }, quoteSuffix: { untrustedText: " on Friday." }, onTextThatChanged: false });
    expect(byId.get(comments.onApproved)?.author).toEqual({ handle: handle("ada"), kind: "person", name: { untrustedText: "Ada Lovelace" } });
    expect(byId.get(comments.onApproved)?.resolved).toEqual({ at: expect.any(String) as unknown, by: { handle: handle("owner"), kind: "person", name: { untrustedText: "Owner Person" } } });
    // The reader from another team is no teammate: a handle only.
    expect(byId.get(comments.reply)?.author).toEqual({ handle: handle("outsider"), kind: "person" });
  });

  it("should give a reader served the approved version only quotes in that version, with the text around them read from it, and no teammate's name", async () => {
    const call = await connect(ids.outsider);
    const { json, text } = await call("comments_list", { artifact: doc.publicId });
    const byId = new Map(json.comments.map((item) => [item.id, item]));

    const onApproved = byId.get(comments.onApproved);
    expect(onApproved?.quote).toEqual({ untrustedText: "beta" });
    expect(onApproved?.quotePrefix?.untrustedText).toContain("We ship the");
    expect(onApproved?.quoteSuffix?.untrustedText).toContain("on Friday");
    const onLatest = byId.get(comments.onLatest);
    expect(onLatest).toMatchObject({ quote: null, onTextThatChanged: true });
    expect(onLatest).not.toHaveProperty("quotePrefix");
    expect(onLatest).not.toHaveProperty("quoteSuffix");
    expect(text).not.toContain("gamma");
    expect(text).not.toContain("STORED-");
    expect(onApproved?.author).toEqual({ handle: handle("ada"), kind: "person" });
    expect(onApproved?.resolved?.by).toEqual({ handle: handle("owner"), kind: "person" });
    expect(text).not.toContain("Ada Lovelace");
    expect(text).not.toContain("Bob Builder");
  });

  it("should list the caller, their role and capabilities in each team, and each teammate's role, join date, owner, and muted state, and nothing of other teams", async () => {
    const bot = await connect(ids.bot);
    const { json } = await bot("teams_list", {});
    expect(json.you).toEqual({ handle: handle("bot"), kind: "agent", name: { untrustedText: "Crew Bot" }, for: { untrustedText: "Owner Person" }, muted: true });
    const crew = json.teams.find((item) => item.slug === ids.crew);
    expect(crew).toMatchObject({ role: "member", roleKey: "agent", roleName: "Agent", capabilities: ["analytics.view"] });

    const owner = await connect(ids.owner);
    const listed = await owner("teams_list", {});
    const members = new Map((listed.json.teams.find((item) => item.slug === ids.crew)?.members ?? []).map((member) => [member.handle, member]));
    expect(members.get(handle("bob"))).toEqual({ handle: handle("bob"), kind: "person", name: { untrustedText: "Bob Builder" }, roleKey: "reviewer", customRoleName: { untrustedText: "Reviewer" }, joinedAt: expect.any(String) as unknown });
    expect(members.get(handle("ada"))).toMatchObject({ roleKey: "admin" });
    expect(members.get(handle("bot"))).toMatchObject({ kind: "agent", roleKey: "agent", for: { untrustedText: "Owner Person" }, muted: true });
    expect(listed.json.teams.find((item) => item.slug === ids.crew)?.capabilities).toContain("approve.edits");

    const outsider = await connect(ids.outsider);
    const theirs = await outsider("teams_list", {});
    expect(theirs.json.teams.map((item) => item.slug)).toEqual([ids.press]);
    expect(theirs.text).not.toContain(handle("bob"));
    expect(theirs.text).not.toContain("Reviewer");
    expect(listed.text).not.toContain("@example.com");
  });

  it("should tell an editor who saved and who approved each version and when, and the version before one", async () => {
    const call = await connect(ids.bob);
    const { json } = await call("artifacts_versions", { id: doc.publicId });
    const approved = json.find((item) => item.id === doc.approved);
    expect(approved).toMatchObject({ approved: true, savedBy: { handle: handle("ada"), name: { untrustedText: "Ada Lovelace" } }, approvedBy: { handle: handle("owner") }, approvedAt: expect.any(String) as unknown });
    expect(json.find((item) => item.id === doc.latest)).toMatchObject({ pending: true, savedBy: { handle: handle("bot"), for: { untrustedText: "Owner Person" } } });
    expect(json.find((item) => item.id === doc.latest)).not.toHaveProperty("approvedBy");

    const detail = await call("artifacts_versions", { id: doc.publicId, version: doc.latest });
    expect(detail.json).toMatchObject({ id: doc.latest, previousId: doc.approved });
    expect((await call("artifacts_versions", { id: doc.publicId, version: doc.approved })).json.previousId).toBeNull();
  });

  it("should refuse the history, with its approvers, to a reader outside the team", async () => {
    const call = await connect(ids.outsider);
    await expect(call("artifacts_versions", { id: doc.publicId })).rejects.toThrow(/cannot edit it/);
  });

  it("should give the inbox's unread total, and when an entry was read once it was", async () => {
    const call = await connect(ids.bob);
    const unread = await call("inbox_list", {});
    expect(unread.json.unread).toBe(1);
    expect(unread.json.mentions[0]).toMatchObject({ read: false });
    expect(unread.json.mentions[0]).not.toHaveProperty("readAt");

    await call("inbox_mark_read", { all: true });
    const read = await call("inbox_list", { includeRead: true });
    expect(read.json.unread).toBe(0);
    expect(read.json.mentions[0]).toMatchObject({ read: true, readAt: expect.any(String) as unknown, comment: { author: { handle: handle("ada"), name: { untrustedText: "Ada Lovelace" } } } });
  });
});
