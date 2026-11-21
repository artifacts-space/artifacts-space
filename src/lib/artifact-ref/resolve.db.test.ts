import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Resolving an older artifact reference (the internal id the workspace once
 * copied, a legacy share link) against a real Postgres. It goes through the
 * read decision: whoever may read the artifact gets its 22-character id,
 * and everyone else gets exactly what an id that names nothing gets.
 * Runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_URL ??= "https://artifacts.example";
}

describe.runIf(Boolean(databaseUrl))("artifact references with a database", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, team, teamMember, user } = await import("@/db/schema");
  const { artifactRefField } = await import("@/lib/mcp/artifact-ref-field");
  const { referencedListItem } = await import("@/lib/mcp/artifact-ref-search");
  const { publicIdForRef } = await import("./resolve");

  const tag = randomUUID().slice(0, 8);
  const author = `ref-${tag}-author`;
  const teammate = `ref-${tag}-teammate`;
  const outsider = `ref-${tag}-outsider`;
  const crew = `ref-${tag}-crew`;
  // Internal ids are UUIDs, as createArtifact makes them.
  const ids = { private: randomUUID(), team: randomUUID(), link: randomUUID() };
  const shareIds = { private: randomUUID().replaceAll("-", ""), link: randomUUID().replaceAll("-", "") };
  const publicIds: Record<string, string> = {};

  const internal = (id: string) => ({ kind: "internalId" as const, id });

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([author, teammate, outsider].map((id) => ({ id, name: id, email: `${id}@example.com` })));
    await db.insert(team).values({ id: crew, name: "Crew", slug: crew, personal: false });
    await db.insert(teamMember).values([author, teammate].map((userId) => ({ id: `${crew}-${userId}`, teamId: crew, userId, role: "member" as const })));
    const row = (id: string, visibility: "private" | "team" | "link", shareId: string, teamId: string | null) => ({ id, userId: author, updatedBy: author, title: `${tag} ${visibility}`, content: "Secret body.", kind: "text" as const, visibility, teamId, shareId });
    await db.insert(artifact).values([
      row(ids.private, "private", shareIds.private, null),
      row(ids.team, "team", randomUUID().replaceAll("-", ""), crew),
      row(ids.link, "link", shareIds.link, null),
    ]);
    for (const [key, id] of Object.entries(ids)) {
      const [found] = await db.select({ publicId: artifact.publicId }).from(artifact).where(eq(artifact.id, id));
      publicIds[key] = found?.publicId ?? "";
    }
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, Object.values(ids)));
    await db.delete(team).where(eq(team.id, crew));
    await db.delete(user).where(inArray(user.id, [author, teammate, outsider]));
  });

  it("should give the author the 22-character id of their own private artifact when they hold its internal id", async () => {
    expect(await publicIdForRef(internal(ids.private), author)).toBe(publicIds.private);
    expect(publicIds.private).toMatch(/^[1-9A-HJ-NP-Za-km-z]{22}$/);
  });

  it("should give nobody else the id of a private artifact, exactly as for an internal id that names nothing", async () => {
    expect(await publicIdForRef(internal(ids.private), outsider)).toBeNull();
    expect(await publicIdForRef(internal(ids.private), teammate)).toBeNull();
    expect(await publicIdForRef(internal(randomUUID()), outsider)).toBeNull();
  });

  it("should follow the artifact's sharing: a team artifact resolves for its team only, a link artifact for anyone who holds the value", async () => {
    expect(await publicIdForRef(internal(ids.team), teammate)).toBe(publicIds.team);
    expect(await publicIdForRef(internal(ids.team), outsider)).toBeNull();
    expect(await publicIdForRef(internal(ids.link), outsider)).toBe(publicIds.link);
  });

  it("should put a legacy share link through the same decision", async () => {
    expect(await publicIdForRef({ kind: "shareId", shareId: shareIds.private }, author)).toBe(publicIds.private);
    expect(await publicIdForRef({ kind: "shareId", shareId: shareIds.private }, outsider)).toBeNull();
    expect(await publicIdForRef({ kind: "shareId", shareId: shareIds.link }, outsider)).toBe(publicIds.link);
    expect(await publicIdForRef({ kind: "shareId", shareId: randomUUID().replaceAll("-", "") }, outsider)).toBeNull();
  });

  it("should refuse an outsider's tool call with the same words for another person's private artifact and for an id that names nothing", async () => {
    const refusal = async (value: string) => {
      const parsed = await artifactRefField(outsider).safeParseAsync(value);
      expect(parsed.success, value).toBe(false);
      // The refusal repeats the start of the value it was given; everything else must be equal.
      return (parsed.error?.issues[0]?.message ?? "").replace(/shortened\): "[^"]*"/, 'shortened): "…"');
    };
    const existing = await refusal(ids.private);
    expect(existing).toBe(await refusal(randomUUID()));
    expect(existing).toMatch(/^No artifact you can read has this id\./);
    expect(existing).not.toContain(publicIds.private);
  });

  it("should hand the tool the 22-character id when the caller may read the artifact", async () => {
    expect(await artifactRefField(author).parseAsync(ids.private)).toBe(publicIds.private);
    expect(await artifactRefField(teammate).parseAsync(ids.team.toUpperCase())).toBe(publicIds.team);
  });

  /** Calls a tool as this user, through the SDK's client and the tools as the server registers them. */
  async function callTool(userId: string, name: string, input: Record<string, unknown>) {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerAllTools } = await import("@/lib/mcp/register-tools");
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllTools(server, userId, "full");
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const result = await client.callTool({ name, arguments: input });
      const [first] = result.content as { type: string; text?: string }[];
      return { isError: result.isError === true, text: first?.text ?? "" };
    } finally {
      await client.close();
    }
  }

  it("should open the artifact with artifacts_get from its link or its internal id, and answer with the 22-character id and the link", async () => {
    const origin = process.env.BETTER_AUTH_URL ?? "";
    for (const value of [`${origin}/artifact/${publicIds.private ?? ""}`, `${origin}/app?artifact=${publicIds.private ?? ""}&comments=1`, ids.private]) {
      const result = await callTool(author, "artifacts_get", { id: value });
      expect(result.isError, value).toBe(false);
      expect(JSON.parse(result.text), value).toMatchObject({ id: publicIds.private, url: `${origin}/artifact/${publicIds.private ?? ""}`, content: "Secret body." });
      expect(result.text).not.toContain(ids.private);
    }
  });

  it("should give an outsider's artifacts_get one answer for another person's private artifact and for an id that names nothing", async () => {
    const normal = (text: string) => text.replace(/shortened\): \\?"[^"\\]*\\?"/, 'shortened): "…"');
    const existing = await callTool(outsider, "artifacts_get", { id: ids.private });
    const missing = await callTool(outsider, "artifacts_get", { id: randomUUID() });
    expect(existing.isError).toBe(true);
    expect(normal(existing.text)).toBe(normal(missing.text));
    expect(existing.text).toContain("No artifact you can read has this id.");
    expect(existing.text).not.toContain(publicIds.private);
    expect(existing.text).not.toContain("Secret body.");
  });

  it("should put the artifact first in artifacts_list when the query is its link, and list nothing for a caller who cannot read it", async () => {
    const origin = process.env.BETTER_AUTH_URL ?? "";
    const link = `${origin}/artifact/${publicIds.private ?? ""}`;
    const listed = async (userId: string, query: string) => (JSON.parse((await callTool(userId, "artifacts_list", { query })).text) as { artifacts: { id: string }[] }).artifacts;
    expect((await listed(author, link))[0]?.id).toBe(publicIds.private);
    expect(await listed(outsider, link)).toEqual([]);
    expect(await listed(outsider, ids.private)).toEqual([]);
  });

  it("should find the artifact by its internal id in a search only for a caller who may read it", async () => {
    expect(await referencedListItem(author, ids.private)).toMatchObject({ publicId: publicIds.private, preview: "Secret body." });
    expect(await referencedListItem(outsider, ids.private)).toBeNull();
    expect(await referencedListItem(outsider, publicIds.private ?? "")).toBeNull();
    expect(await referencedListItem(outsider, randomUUID())).toBeNull();
  });
});
