import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The two page file tools against a real Postgres, through the real MCP
 * server, as an agent uses them: one call starts every upload of a set, the
 * agent PUTs the bytes, and one call publishes the set together. File
 * storage is stubbed at its boundary: an object is "stored" when the test
 * puts it in `stored`. It runs only when TEST_DATABASE_URL names a
 * throwaway local database with the migrations applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  // Results carry the artifact's link; the site origin never comes from a request.
  process.env.BETTER_AUTH_URL ??= "https://artifacts.test";
}

/** What file storage holds, by key: the test's stand-in for a PUT. */
const stored = new Map<string, { size: number; contentType: string; start: Uint8Array }>();
const deleted: string[] = [];

vi.mock("@/lib/files/r2", () => ({
  r2ConfigFromEnv: () => ({}),
  presignUpload: (_config: unknown, input: { key: string; contentType: string; size: number; expiresIn: number }) =>
    Promise.resolve({ url: `https://storage.test/${input.key}?signed`, method: "PUT", headers: { "Content-Type": input.contentType, "Content-Length": String(input.size) }, expiresAt: new Date(Date.now() + input.expiresIn * 1000) }),
  headObject: (_config: unknown, key: string) => {
    const object = stored.get(key);
    return Promise.resolve(object ? { size: object.size, contentType: object.contentType } : null);
  },
  readObjectStart: (_config: unknown, key: string) => Promise.resolve(stored.get(key)?.start ?? new Uint8Array()),
  deleteObject: (_config: unknown, key: string) => {
    deleted.push(key);
    stored.delete(key);
    return Promise.resolve();
  },
}));

// The approved version a reader gets is read through the framework's cache, which exists only inside a running app. Here the read goes straight to the database.
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof NextCache>()), cacheLife: () => undefined, cacheTag: () => undefined }));

describe.runIf(Boolean(databaseUrl))("page file tools with a database", async () => {
  const { and, eq, inArray, isNotNull, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactFileCopy } = await import("@/db/file-copy-schema");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, sharingRequest, team, teamMember, user } = await import("@/db/schema");
  const { getArtifactAccess } = await import("@/lib/access");
  const artifacts = await import("@/lib/artifacts");
  const { servedVersionTime } = await import("@/lib/files/download");
  const { pageBatchLimits } = await import("@/lib/page-files/publish-rules");
  const { findPageFile } = await import("@/lib/page-files/store");
  const { registerPageFileTools } = await import("./page-file-tools");

  const tag = randomUUID().slice(0, 8);
  const owner = `pagetools-${tag}-owner`;
  const outsider = `pagetools-${tag}-outsider`;
  const teamId = `pagetools-${tag}-team`;
  const claude = { harness: "claude-code" as const, label: null };
  const text = (value: string) => new TextEncoder().encode(value);

  /** Save times have millisecond precision; each save here starts in a new millisecond, as people's and agents' saves do. */
  const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 2));

  async function row(id: string) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, id)).limit(1);
    if (!found) throw new Error("No such artifact.");
    return found;
  }

  async function newPage(userId = owner, kind: "html" | "markdown" = "html") {
    const made = await artifacts.createArtifact(userId, { title: "Launch site", kind, content: kind === "html" ? "<!doctype html><title>Launch</title><link rel=\"stylesheet\" href=\"css/site.css\">" : "Notes" });
    return row(made.id);
  }

  async function pageFiles(artifactId: string) {
    const rows = await getDb().select().from(artifactFile).where(and(eq(artifactFile.artifactId, artifactId), isNotNull(artifactFile.pagePath)));
    return rows.sort((a, b) => (a.pagePath ?? "").localeCompare(b.pagePath ?? ""));
  }

  const pathsOf = async (artifactId: string) => (await pageFiles(artifactId)).map((file) => file.pagePath);

  async function uploadsOf(userId: string) {
    return getDb().select().from(artifactFile).where(eq(artifactFile.uploaderId, userId));
  }

  async function fileVersionCount(artifactId: string) {
    const rows = await getDb().select({ id: artifactVersion.id }).from(artifactVersion).where(and(eq(artifactVersion.artifactId, artifactId), eq(artifactVersion.saveKind, "files")));
    return rows.length;
  }

  interface ToolResult {
    isError?: boolean;
    content: { type: string; text: string }[];
    structuredContent?: { error?: { code: string; message: string; nextStep: string } };
  }

  interface StartedUploads {
    uploads: { path: string; fileId: string; size: number; url: string; headers: Record<string, string> }[];
    fileIds: string[];
    put: string;
    next: string;
  }

  interface Published {
    id: string;
    baseVersion: string;
    files: { id: string; pagePath?: string; size: number }[];
    published: { status: string; added: string[]; replaced: string[]; removed: string[] };
  }

  const clients: Client[] = [];

  /** An agent connected as `userId`, with the page file tools. */
  async function agentOf(userId: string) {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerPageFileTools(server, userId, "full", () => Promise.resolve(claude));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    clients.push(client);
    return async (name: string, args: Record<string, unknown>) => {
      await nextMillisecond();
      const result = (await client.callTool({ name, arguments: args })) as ToolResult;
      const body = result.content[0]?.text ?? "";
      return { isError: result.isError === true, text: body, error: result.structuredContent?.error, json: () => JSON.parse(body) as unknown };
    };
  }

  /** The agent's PUT: stores the object its upload asked for, or one that differs from it. */
  async function put(fileId: string, differing: { size?: number; start?: Uint8Array } = {}) {
    const [file] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, fileId));
    if (!file) throw new Error("No such upload.");
    stored.set(file.key, { size: differing.size ?? file.size, contentType: file.contentType, start: differing.start ?? text("body { margin: 0 }") });
  }

  type Agent = Awaited<ReturnType<typeof agentOf>>;

  /** Requests and PUTs a set, and returns its file ids by path. */
  async function uploaded(call: Agent, publicId: string, files: { path: string; size: number }[], remove?: string[]) {
    const started = await call("page_files_request_uploads", { artifact: publicId, files, ...(remove ? { remove } : {}) });
    expect(started.isError, started.text).toBe(false);
    const { uploads, fileIds } = started.json() as StartedUploads;
    await Promise.all(fileIds.map((id) => put(id)));
    return { fileIds, idAt: new Map(uploads.map((upload) => [upload.path, upload.fileId])) };
  }

  const site = [{ path: "css/site.css", size: 120 }, { path: "js/app.js", size: 340 }, { path: "data/items.json", size: 56 }];

  beforeAll(async () => {
    await getDb().insert(user).values([owner, outsider].map((id) => ({ id, name: id, email: `${id}@example.com` })));
    await getDb().insert(team).values({ id: teamId, name: "Page tools team", slug: teamId, personal: false });
    await getDb().insert(teamMember).values({ id: `${teamId}-m`, teamId, userId: owner, role: "owner" });
  });

  beforeEach(async () => {
    stored.clear();
    deleted.length = 0;
    // Each case starts with no uploads waiting and a fresh hourly budget.
    await getDb().delete(artifactFile).where(and(inArray(artifactFile.uploaderId, [owner, outsider]), eq(artifactFile.status, "pending")));
    await getDb().delete(rateLimitBucket).where(like(rateLimitBucket.key, `%pagetools-${tag}-%`));
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    const db = getDb();
    await db.delete(sharingRequest).where(inArray(sharingRequest.requestedBy, [owner, outsider]));
    await db.delete(artifactFileCopy).where(inArray(artifactFileCopy.uploaderId, [owner, outsider]));
    await db.delete(artifactFile).where(inArray(artifactFile.uploaderId, [owner, outsider]));
    await db.delete(artifact).where(inArray(artifact.userId, [owner, outsider]));
    await db.delete(team).where(eq(team.id, teamId));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%pagetools-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [owner, outsider]));
  });

  it("should start every upload of a set in one call, then publish the set together as one version", async () => {
    const page = await newPage();
    const call = await agentOf(owner);

    const started = await call("page_files_request_uploads", { artifact: page.publicId, files: site });
    expect(started.isError, started.text).toBe(false);
    const result = started.json() as StartedUploads;
    // For a shell loop: each file's path, where to PUT it, and the headers to send.
    expect(result.uploads.map((upload) => upload.path)).toEqual(["css/site.css", "js/app.js", "data/items.json"]);
    expect(result.uploads.map((upload) => upload.headers)).toEqual([
      { "Content-Type": "text/css", "Content-Length": "120" },
      { "Content-Type": "text/javascript", "Content-Length": "340" },
      { "Content-Type": "application/json", "Content-Length": "56" },
    ]);
    expect(result.uploads.every((upload) => upload.url.startsWith("https://storage.test/"))).toBe(true);
    expect(result.fileIds).toEqual(result.uploads.map((upload) => upload.fileId));
    expect(result.put).toContain("curl -sf -X PUT");
    // Nothing is in the page yet, and the uploads counted once each against the hourly limit.
    expect(await pathsOf(page.id)).toEqual([]);
    const [bucket] = await getDb().select().from(rateLimitBucket).where(like(rateLimitBucket.key, `pageFileUpload:${owner}`));
    expect(bucket?.count).toBe(3);

    await put(result.fileIds[0] ?? "");
    await put(result.fileIds[1] ?? "", { start: text("export const app = 1;") });
    await put(result.fileIds[2] ?? "", { start: text("[1, 2, 3]") });
    const versionsBefore = await fileVersionCount(page.id);
    const published = await call("page_files_publish", { artifact: page.publicId, uploads: result.fileIds });
    expect(published.isError, published.text).toBe(false);
    const saved = published.json() as Published;
    expect(saved.published).toEqual({ status: "applied", added: ["css/site.css", "js/app.js", "data/items.json"], replaced: [], removed: [] });
    expect(saved.files.map((file) => file.pagePath).sort()).toEqual(["css/site.css", "data/items.json", "js/app.js"]);
    expect(await pathsOf(page.id)).toEqual(["css/site.css", "data/items.json", "js/app.js"]);
    expect((await pageFiles(page.id)).every((file) => file.status === "ready")).toBe(true);
    expect(await fileVersionCount(page.id)).toBe(versionsBefore + 1);
    // The result's baseVersion names this publish's own save.
    expect(saved.baseVersion.endsWith(`.${String((await row(page.id)).updatedAt.getTime())}`)).toBe(true);
  });

  it("should start nothing, and name every file at fault, when files of the set are wrong", async () => {
    const page = await newPage();
    const call = await agentOf(owner);
    const before = (await uploadsOf(owner)).length;

    const refused = await call("page_files_request_uploads", { artifact: page.publicId, files: [{ path: "css/site.css", size: 120 }, { path: "../up.css", size: 10 }, { path: "about.htm", size: 10 }, { path: "run.exe", size: 10 }] });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("No upload was started.");
    for (const path of ["../up.css", "about.htm", "run.exe"]) expect(refused.text).toContain(`- ${path}:`);
    expect(refused.text).not.toContain("- css/site.css:");
    expect((await uploadsOf(owner)).length).toBe(before);
    expect(await getDb().select().from(rateLimitBucket).where(like(rateLimitBucket.key, `pageFileUpload:${owner}`))).toEqual([]);
  });

  it("should refuse a set that would take the page over its limits, counting the files the same publish removes", async () => {
    const page = await newPage();
    const call = await agentOf(owner);
    const first = await uploaded(call, page.publicId, [{ path: "img/hero.svg", size: 15 * 1024 * 1024 }]);
    expect((await call("page_files_publish", { artifact: page.publicId, uploads: first.fileIds })).isError).toBe(false);

    const tooMuch = [{ path: "img/second.svg", size: 2 * 1024 * 1024 }];
    const refused = await call("page_files_request_uploads", { artifact: page.publicId, files: tooMuch });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("The limit is 16 MB");
    // The same set fits when the publish also removes the big file.
    const fits = await call("page_files_request_uploads", { artifact: page.publicId, files: tooMuch, remove: ["img/hero.svg"] });
    expect(fits.isError, fits.text).toBe(false);
  });

  it("should publish nothing when one upload is at fault, name it, and take the rest once it is fixed", async () => {
    const page = await newPage();
    const call = await agentOf(owner);
    const started = (await call("page_files_request_uploads", { artifact: page.publicId, files: site })).json() as StartedUploads;
    const [css = "", js = "", json = ""] = started.fileIds;
    await put(css);
    await put(json, { start: text("[]") });
    const savedAt = (await row(page.id)).updatedAt.getTime();
    const versionsBefore = await fileVersionCount(page.id);

    // The script never arrived.
    const missing = await call("page_files_publish", { artifact: page.publicId, uploads: started.fileIds });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("Nothing was published.");
    expect(missing.text).toContain("- js/app.js: The file has not arrived yet.");
    expect(missing.text).not.toContain("- css/site.css:");
    expect(await pathsOf(page.id)).toEqual([]);
    expect(await fileVersionCount(page.id)).toBe(versionsBefore);
    expect((await row(page.id)).updatedAt.getTime()).toBe(savedAt);

    // It arrives with the wrong size: that upload is removed, and the page still has nothing.
    await put(js, { size: 999 });
    const wrong = await call("page_files_publish", { artifact: page.publicId, uploads: started.fileIds });
    expect(wrong.isError).toBe(true);
    expect(wrong.text).toContain("- js/app.js: The upload was refused and removed.");
    expect(await pathsOf(page.id)).toEqual([]);

    // A new upload for the one path; the two that were fine are still ready.
    const again = await uploaded(call, page.publicId, [{ path: "js/app.js", size: 340 }]);
    const published = await call("page_files_publish", { artifact: page.publicId, uploads: [css, json, ...again.fileIds] });
    expect(published.isError, published.text).toBe(false);
    expect(await pathsOf(page.id)).toEqual(["css/site.css", "data/items.json", "js/app.js"]);
    expect(await fileVersionCount(page.id)).toBe(versionsBefore + 1);
  });

  it("should add, replace, and remove in one step, and refuse a publish built on an older save", async () => {
    const page = await newPage();
    const call = await agentOf(owner);
    const first = await uploaded(call, page.publicId, site);
    const firstSave = (await call("page_files_publish", { artifact: page.publicId, uploads: first.fileIds })).json() as Published;
    const cssId = first.idAt.get("css/site.css") ?? "";
    const [cssBefore] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, cssId));
    const [jsBefore] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, first.idAt.get("js/app.js") ?? ""));

    const next = await uploaded(call, page.publicId, [{ path: "css/site.css", size: 200 }, { path: "img/logo.svg", size: 80 }], ["js/app.js"]);
    const published = await call("page_files_publish", { artifact: page.publicId, uploads: next.fileIds, remove: ["js/app.js"], baseVersion: firstSave.baseVersion });
    expect(published.isError, published.text).toBe(false);
    const saved = published.json() as Published;
    expect(saved.published).toEqual({ status: "applied", added: ["img/logo.svg"], replaced: ["css/site.css"], removed: ["js/app.js"] });
    expect(await pathsOf(page.id)).toEqual(["css/site.css", "data/items.json", "img/logo.svg"]);
    // The stylesheet keeps its id and path and holds the new object; the old one is a copy in History.
    const [cssAfter] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, cssId));
    expect(cssAfter).toMatchObject({ id: cssId, pagePath: "css/site.css", size: 200 });
    expect(cssAfter?.key).not.toBe(cssBefore?.key);
    const copies = await getDb().select().from(artifactFileCopy).where(eq(artifactFileCopy.fileId, cssId));
    expect(copies.map((copy) => copy.key)).toEqual([cssBefore?.key]);
    // The removed script's object is deleted from storage.
    expect(deleted).toContain(jsBefore?.key);

    // The first save's baseVersion is stale now: a publish built on it is refused as a typed conflict, and changes nothing.
    const stale = await uploaded(call, page.publicId, [{ path: "js/late.js", size: 10 }]);
    const conflict = await call("page_files_publish", { artifact: page.publicId, uploads: stale.fileIds, baseVersion: firstSave.baseVersion });
    expect(conflict.isError).toBe(true);
    expect(conflict.error).toMatchObject({ code: "artifact_changed", nextStep: "artifacts_get" });
    expect(await pathsOf(page.id)).toEqual(["css/site.css", "data/items.json", "img/logo.svg"]);
    const malformed = await call("page_files_publish", { artifact: page.publicId, uploads: stale.fileIds, baseVersion: "not-a-base" });
    expect(malformed.isError).toBe(true);
    expect(await pathsOf(page.id)).toEqual(["css/site.css", "data/items.json", "img/logo.svg"]);
    // With the save it read, the same uploads publish.
    expect((await call("page_files_publish", { artifact: page.publicId, uploads: stale.fileIds, baseVersion: saved.baseVersion })).isError).toBe(false);
  });

  it("should refuse someone who cannot edit the artifact, and never publish another person's uploads", async () => {
    const page = await newPage();
    const ownerCall = await agentOf(owner);
    const stranger = await agentOf(outsider);
    const mine = await uploaded(ownerCall, page.publicId, [{ path: "css/site.css", size: 120 }]);

    const request = await stranger("page_files_request_uploads", { artifact: page.publicId, files: [{ path: "js/evil.js", size: 10 }] });
    expect(request.isError).toBe(true);
    expect(request.text).toContain("you cannot edit it");
    expect(await uploadsOf(outsider)).toEqual([]);

    // The stranger knows the owner's upload ids and the artifact's id: neither call takes them.
    const publish = await stranger("page_files_publish", { artifact: page.publicId, uploads: mine.fileIds });
    expect(publish.isError).toBe(true);
    expect(publish.text).toContain("you cannot edit it");
    const removal = await stranger("page_files_publish", { artifact: page.publicId, remove: ["css/site.css"] });
    expect(removal.isError).toBe(true);
    const theirPage = await newPage(outsider);
    const borrowed = await stranger("page_files_publish", { artifact: theirPage.publicId, uploads: mine.fileIds });
    expect(borrowed.isError).toBe(true);
    expect(borrowed.text).toContain("not yours");
    expect(await pathsOf(page.id)).toEqual([]);
    expect(await pathsOf(theirPage.id)).toEqual([]);
    // The owner's uploads are untouched and still publish.
    expect((await ownerCall("page_files_publish", { artifact: page.publicId, uploads: mine.fileIds })).isError).toBe(false);
    expect(await pathsOf(page.id)).toEqual(["css/site.css"]);
  });

  it("should refuse page files for an artifact that is not HTML", async () => {
    const doc = await newPage(owner, "markdown");
    const call = await agentOf(owner);
    const refused = await call("page_files_request_uploads", { artifact: doc.publicId, files: [{ path: "css/site.css", size: 120 }] });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("Page files belong to an HTML artifact");
    expect((await uploadsOf(owner)).filter((file) => file.status === "pending")).toEqual([]);
  });

  it("should let an agent ask for a whole set again while the first still waits, and refuse a third", async () => {
    const page = await newPage();
    const call = await agentOf(owner);
    const set = (count: number, prefix: string) => Array.from({ length: count }, (_unused, index) => ({ path: `${prefix}/f${String(index)}.css`, size: 1 }));
    const waiting = async () => (await uploadsOf(owner)).filter((file) => file.status === "pending").length;
    const half = pageBatchLimits.maxUploadsPerRequest;
    // A site of 100 files starts in two calls.
    expect((await call("page_files_request_uploads", { artifact: page.publicId, files: set(half, "a") })).isError).toBe(false);
    expect((await call("page_files_request_uploads", { artifact: page.publicId, files: set(half, "b") })).isError).toBe(false);
    // The same sets again, as after upload addresses that ran out: they fit beside the first.
    expect((await call("page_files_request_uploads", { artifact: page.publicId, files: set(half, "a") })).isError).toBe(false);
    expect((await call("page_files_request_uploads", { artifact: page.publicId, files: set(half, "b") })).isError).toBe(false);
    // One call never starts more than its cap.
    expect((await call("page_files_request_uploads", { artifact: page.publicId, files: set(half + 1, "c") })).isError).toBe(true);
    expect(await waiting()).toBe(pageBatchLimits.maxPendingUploads);
    const over = await call("page_files_request_uploads", { artifact: page.publicId, files: set(1, "d") });
    expect(over.isError).toBe(true);
    expect(over.text).toContain(`At most ${String(pageBatchLimits.maxPendingUploads)} may wait at once`);
    expect(await waiting()).toBe(pageBatchLimits.maxPendingUploads);
  });

  it("should keep readers outside the team on the approved files while an agent's publish waits for approval", async () => {
    const page = await newPage();
    const call = await agentOf(owner);
    const first = await uploaded(call, page.publicId, [{ path: "css/site.css", size: 120 }]);
    expect((await call("page_files_publish", { artifact: page.publicId, uploads: first.fileIds })).isError).toBe(false);
    const [approvedCss] = await pageFiles(page.id);
    // Shared publicly through the owner's team: an agent's changes wait for an owner or admin.
    await getDb().update(artifact).set({ teamId, visibility: "public" }).where(eq(artifact.id, page.id));

    const next = await uploaded(call, page.publicId, [{ path: "css/site.css", size: 200 }, { path: "js/new.js", size: 30 }]);
    const published = await call("page_files_publish", { artifact: page.publicId, uploads: next.fileIds });
    expect(published.isError, published.text).toBe(false);
    expect((published.json() as Published).published).toMatchObject({ status: "pending", added: ["js/new.js"], replaced: ["css/site.css"] });
    const requests = await getDb().select().from(sharingRequest).where(and(eq(sharingRequest.artifactId, page.id), eq(sharingRequest.status, "pending")));
    expect(requests).toHaveLength(1);

    // A reader outside the team is served the approved version: its stylesheet, and no file added since.
    const viewable = await getArtifactAccess(page.publicId, null);
    if (!viewable) throw new Error("A public artifact was not readable.");
    const servedAt = servedVersionTime(viewable);
    expect(servedAt, "the reader was served the unapproved files").not.toBeNull();
    expect(await findPageFile(page.id, "css/site.css", servedAt)).toMatchObject({ key: approvedCss?.key, size: 120 });
    expect(await findPageFile(page.id, "js/new.js", servedAt)).toBeNull();
    // People who may edit get the published files.
    expect(await findPageFile(page.id, "css/site.css", null)).toMatchObject({ size: 200 });
    expect(await findPageFile(page.id, "js/new.js", null)).not.toBeNull();
  });
});
