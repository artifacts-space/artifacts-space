import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Agents @mentioning teammates, through the real MCP server against a real
 * Postgres, as both kinds of agent: a person's own connection (it acts as the
 * person) and an agent a person added to the team (its own user). An agent
 * learns its teammates' handles from teams_list and nobody else's; a comment
 * or a document's text notifies a teammate who can see it; a teammate who
 * cannot see it yet is told nothing and the agent is told to share it first;
 * a name, an unknown handle, and someone outside the writer's teams read the
 * same and notify nobody; an agent's document save never notifies an agent,
 * and a muted agent is never notified. It runs only when TEST_DATABASE_URL
 * names a throwaway local database with the migrations applied; never a
 * shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  // Results carry the artifact's link; the site origin never comes from a request.
  process.env.BETTER_AUTH_URL ??= "https://artifacts.test";
}

vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof NextCache>()), cacheLife: () => undefined, cacheTag: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
const sendMentionEmail = vi.fn();
vi.mock("@/lib/comments/mention-email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendMentionEmail }));

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

interface Refusal {
  handle: string;
  reason: string;
  message: string;
  next?: string;
}

interface CommentResult {
  mentions: { notified: { handle: string }[]; refused: Refusal[] };
}

interface Saved {
  artifact: { id: string; baseVersion?: string };
  sharing: { status: string } | null;
  mentions?: { reaches: string[]; onceTheyCanRead: string[]; notNotified: { handle: string; message: string }[] };
}

interface ListedTeam {
  slug: string;
  personal: boolean;
  members?: { handle: string; kind: string; name: { untrustedText: string } }[];
}

/** What each tool the tests call returns. */
interface Results {
  teams_list: ListedTeam[];
  comment_create: CommentResult;
  artifacts_create: Saved;
  artifacts_update: Saved;
  artifacts_get: { baseVersion?: string };
}

describe.runIf(Boolean(databaseUrl))("agents mentioning teammates over MCP", async () => {
  const { and, eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { notification } = await import("@/db/notification-schema");
  const { agent, artifact, artifactVersion, comment, mention, rateLimitBucket, sharingRequest, team, teamMember, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { decideSharingRequest } = await import("@/lib/sharing/service");
  const { registerAllTools } = await import("./register-tools");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `agentmention-${tag}-${name}`;
  const handle = (name: string) => `${name}-${tag}`;
  const ids = { owner: id("owner"), ada: id("ada"), bot: id("bot"), helper: id("helper"), quiet: id("quiet"), outsider: id("outsider"), crew: id("crew"), press: id("press"), home: id("home") };
  const people = [ids.owner, ids.ada, ids.bot, ids.helper, ids.quiet, ids.outsider];
  const clients: Client[] = [];

  async function connect(userId: string, access: "full" | "read" = "full") {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllTools(server, userId, access, () => Promise.resolve({ harness: "claude-code" as const, label: null }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    clients.push(client);
    const call = async <Name extends keyof Results>(name: Name, args: Record<string, unknown>) => {
      const result = (await client.callTool({ name, arguments: args })) as ToolResult;
      const text = result.content[0]?.text ?? "";
      if (result.isError) throw new Error(`${name} failed: ${text}`);
      return { text, json: JSON.parse(text) as Results[Name] };
    };
    return { client, call };
  }

  type Call = Awaited<ReturnType<typeof connect>>["call"];

  /** An artifact the owner wrote, as a person saved it in the web app. */
  async function ownerDoc(overrides: Partial<typeof artifact.$inferInsert> = {}) {
    const [row] = await getDb()
      .insert(artifact)
      .values({ id: randomUUID(), userId: ids.owner, updatedBy: ids.owner, kind: "markdown", title: "Plan", content: "# Plan\n", visibility: "team", teamId: ids.crew, comments: "team", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId(), ...overrides })
      .returning();
    if (!row) throw new Error("The test artifact was not created.");
    return row;
  }

  const mentionsOf = async (artifactId: string) =>
    (await getDb().select({ recipientId: mention.recipientId, commentId: mention.commentId }).from(mention).where(eq(mention.artifactId, artifactId)))
      .map((row) => `${row.recipientId}:${row.commentId === null ? "document" : "comment"}`)
      .sort();
  const emailed = () => sendMentionEmail.mock.calls.map((args) => (args[0] as { email: string }).email);

  /** Saves new text over MCP with the base the agent read, as an agent should. */
  async function saveText(call: Call, publicId: string, content: string) {
    const read = await call("artifacts_get", { id: publicId });
    return (await call("artifacts_update", { id: publicId, content, baseVersion: read.json.baseVersion })).json;
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([
      { id: ids.owner, name: "Owner Person", email: `${ids.owner}@example.com`, username: handle("owner"), usernameConfirmed: true },
      { id: ids.ada, name: "Ada Lovelace", email: `${ids.ada}@example.com`, username: handle("ada"), usernameConfirmed: true },
      { id: ids.outsider, name: "Olga Outside", email: `${ids.outsider}@example.com`, username: handle("outsider"), usernameConfirmed: true },
      { id: ids.bot, name: "Bot", email: `agent-${ids.bot}@agents.artifacts.invalid`, username: handle("bot"), usernameConfirmed: true },
      { id: ids.helper, name: "Helper", email: `agent-${ids.helper}@agents.artifacts.invalid`, username: handle("helper"), usernameConfirmed: true },
      { id: ids.quiet, name: "Quiet", email: `agent-${ids.quiet}@agents.artifacts.invalid`, username: handle("quiet"), usernameConfirmed: true },
    ]);
    // The crew is the shared team; the press team is the outsider's alone; home is the owner's personal team.
    await db.insert(team).values([
      { id: ids.crew, name: "Crew", slug: ids.crew, personal: false },
      { id: ids.press, name: "Press", slug: ids.press, personal: false },
      { id: ids.home, name: "Home", slug: ids.home, personal: true, createdBy: ids.owner },
    ]);
    await db.insert(teamMember).values([
      { id: id("m-home"), teamId: ids.home, userId: ids.owner, role: "owner" },
      { id: id("m-owner"), teamId: ids.crew, userId: ids.owner, role: "owner" },
      { id: id("m-ada"), teamId: ids.crew, userId: ids.ada, role: "member" },
      { id: id("m-bot"), teamId: ids.crew, userId: ids.bot, role: "member" },
      { id: id("m-helper"), teamId: ids.crew, userId: ids.helper, role: "member" },
      { id: id("m-quiet"), teamId: ids.crew, userId: ids.quiet, role: "member" },
      { id: id("m-outsider"), teamId: ids.press, userId: ids.outsider, role: "owner" },
    ]);
    await db.insert(agent).values([
      { userId: ids.bot, teamId: ids.crew, ownerId: ids.owner },
      { userId: ids.helper, teamId: ids.crew, ownerId: ids.owner },
      { userId: ids.quiet, teamId: ids.crew, ownerId: ids.owner, mutedAt: new Date(), mutedBy: ids.owner },
    ]);
  });

  beforeEach(() => {
    sendMentionEmail.mockClear();
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    const db = getDb();
    const owned = (await db.select({ id: artifact.id }).from(artifact).where(inArray(artifact.userId, people))).map((row) => row.id);
    if (owned.length > 0) {
      await db.delete(notification).where(inArray(notification.artifactId, owned));
      await db.delete(mention).where(inArray(mention.artifactId, owned));
      await db.delete(comment).where(inArray(comment.artifactId, owned));
      await db.delete(sharingRequest).where(inArray(sharingRequest.artifactId, owned));
      await db.update(artifact).set({ approvedVersionId: null }).where(inArray(artifact.id, owned));
      await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, owned));
      await db.delete(artifact).where(inArray(artifact.id, owned));
    }
    await db.delete(agent).where(inArray(agent.userId, people));
    // Teams go whole: their members cannot be removed one by one down to none (team_keeps_an_owner).
    await db.delete(team).where(inArray(team.id, [ids.crew, ids.press, ids.home]));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%agentmention-${tag}-%`));
    await db.delete(user).where(inArray(user.id, people));
  });

  it("should list each shared team's members to mention by handle, without the caller, an email, or anyone outside the caller's teams", async () => {
    for (const caller of [ids.owner, ids.bot]) {
      const { call } = await connect(caller);
      const listed = await call("teams_list", {});
      const crew = listed.json.find((item) => item.slug === ids.crew);
      const members = new Map((crew?.members ?? []).map((member) => [member.handle, member]));

      expect(members.get(handle("ada"))).toEqual({ handle: handle("ada"), kind: "person", name: { untrustedText: "Ada Lovelace" } });
      expect(members.get(handle("helper"))?.kind).toBe("agent");
      expect(members.has(handle(caller === ids.owner ? "owner" : "bot"))).toBe(false);
      // Nobody outside the caller's teams, and never an email.
      expect(listed.json.map((item) => item.slug)).not.toContain(ids.press);
      expect(listed.text).not.toContain(handle("outsider"));
      expect(listed.text).not.toContain("Olga");
      expect(listed.text).not.toContain("@example.com");
      expect(listed.text).not.toContain("agents.artifacts.invalid");
    }
    const { call } = await connect(ids.owner);
    const home = (await call("teams_list", {})).json.find((item) => item.slug === ids.home);
    expect(home).toMatchObject({ personal: true });
    expect(home?.members).toBeUndefined();
  });

  it("should notify a teammate an agent mentions by handle in a comment and in the document's text, for a person's connection and an added agent", async () => {
    for (const caller of [ids.owner, ids.bot]) {
      sendMentionEmail.mockClear();
      const doc = await ownerDoc();
      const { call } = await connect(caller);

      const posted = await call("comment_create", { artifact: doc.publicId, body: `Over to @${handle("ada")}.` });
      const saved = await saveText(call, doc.publicId, `# Plan\n\nOver to @${handle("ada")}.\n`);

      expect(posted.json.mentions).toEqual({ notified: [{ handle: handle("ada"), kind: "person" }], refused: [] });
      expect(saved.mentions).toEqual({ reaches: [handle("ada")], onceTheyCanRead: [], notNotified: [] });
      // The document's delivery runs after the response; outside a request it starts at once and is not awaited.
      await vi.waitFor(async () => { expect(await mentionsOf(doc.id)).toEqual([`${ids.ada}:comment`, `${ids.ada}:document`]); }, { timeout: 5000 });
      // One email: an unread mention on the artifact keeps the second quiet.
      expect(emailed()).toEqual([`${ids.ada}@example.com`]);
    }
  });

  it("should tell a teammate nothing while the artifact is private, say to share it first, and tell them of the text once it is shared", async () => {
    const { call } = await connect(ids.owner);
    // The crew needs approval to move an artifact in, so the agent's ask waits and the artifact stays private.
    const created = (await call("artifacts_create", { title: "Draft", content: `# Draft\n\nFor @${handle("ada")}.\n`, visibility: "team", team: ids.crew })).json;
    expect(created.sharing).toEqual({ status: "pending" });
    expect(created.mentions).toEqual({ reaches: [], onceTheyCanRead: [handle("ada")], notNotified: [] });

    const posted = await call("comment_create", { artifact: created.artifact.id, body: `Can @${handle("ada")} look?` });
    expect(posted.json.mentions.notified).toEqual([]);
    expect(posted.json.mentions.refused).toEqual([
      expect.objectContaining({ handle: handle("ada"), reason: "cannot_see", message: expect.stringContaining("cannot see this artifact's comments yet") as unknown, next: expect.stringContaining("Share the artifact with their team first") as unknown }),
    ]);
    const [row] = await getDb().select().from(artifact).where(eq(artifact.publicId, created.artifact.id));
    if (!row) throw new Error("The artifact is gone.");
    expect(await mentionsOf(row.id)).toEqual([]);
    expect(emailed()).toEqual([]);

    const [request] = await getDb().select().from(sharingRequest).where(and(eq(sharingRequest.artifactId, row.id), eq(sharingRequest.status, "pending")));
    if (!request) throw new Error("The sharing ask was not filed.");
    await decideSharingRequest({ deciderId: ids.owner, requestId: request.id, approve: true });

    // The text names Ada, so she hears of it once she can read it; the refused comment mention stays refused.
    await vi.waitFor(async () => { expect(await mentionsOf(row.id)).toEqual([`${ids.ada}:document`]); }, { timeout: 5000 });
    expect(emailed()).toEqual([`${ids.ada}@example.com`]);
  });

  it("should refuse a name, an unknown handle, and someone outside the writer's teams with the same words, and notify none of them", async () => {
    // Public with comments open to anyone signed in: the outsider can read it and its comments, and still shares no team with the writer.
    const doc = await ownerDoc({ visibility: "public", comments: "signed_in" });
    const words = (item: { handle: string; message: string }) => item.message.replace(`@${item.handle}`, "@x");
    for (const caller of [ids.owner, ids.bot]) {
      const { call } = await connect(caller);
      const posted = await call("comment_create", { artifact: doc.publicId, body: `@Ada, @nobody-${tag}, and @${handle("outsider")}: thoughts?` });
      const saved = await saveText(call, doc.publicId, `# Plan\n\n@Ada, @nobody-${tag}, and @${handle("outsider")}.\n`);

      const { refused } = posted.json.mentions;
      expect(posted.json.mentions.notified).toEqual([]);
      expect(refused.map((item) => item.reason)).toEqual(["not_visible", "not_visible", "not_visible"]);
      // The words never say which handles exist.
      expect(new Set(refused.map(words)).size).toBe(1);
      expect(refused[0]?.next).toContain("teams_list");
      expect(saved.mentions?.reaches).toEqual([]);
      expect(saved.mentions?.notNotified.map((item) => item.handle)).toEqual(["ada", `nobody-${tag}`, handle("outsider")]);
      expect(new Set(saved.mentions?.notNotified.map(words)).size).toBe(1);
    }
    // Nothing lands later either: the document's delivery runs after the response.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await mentionsOf(doc.id)).toEqual([]);
    expect(emailed()).toEqual([]);
  });

  it("should never notify a muted agent, and never let an added agent's document save notify an agent", async () => {
    const doc = await ownerDoc();
    const { call } = await connect(ids.bot);

    const posted = await call("comment_create", { artifact: doc.publicId, body: `@${handle("quiet")} please check.` });
    const saved = await saveText(call, doc.publicId, `# Plan\n\n@${handle("helper")} and @${handle("quiet")}, and @${handle("ada")}.\n`);

    expect(posted.json.mentions.refused).toEqual([expect.objectContaining({ handle: handle("quiet"), reason: "muted" })]);
    expect(saved.mentions?.reaches).toEqual([handle("ada")]);
    expect(saved.mentions?.notNotified).toEqual([
      { handle: handle("helper"), message: expect.stringContaining("An agent's save never notifies another agent") as unknown },
      { handle: handle("quiet"), message: expect.stringContaining("This agent is muted here") as unknown },
    ]);
    await vi.waitFor(async () => { expect(await mentionsOf(doc.id)).toEqual([`${ids.ada}:document`]); }, { timeout: 5000 });
  });

  it("should give a read-only connection teams_list and no tool that comments or saves", async () => {
    const { client } = await connect(ids.owner, "read");
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("teams_list");
    for (const writer of ["comment_create", "comment_update", "artifacts_create", "artifacts_update"]) expect(names).not.toContain(writer);
  });
});
