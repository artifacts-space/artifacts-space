import { createHash, randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";
import { Pool } from "pg";
import { z } from "zod";

import { cleanUp, createTestArtifact, readyDevUser } from "./support/local-db";
import { localStorageEnabled, localStorageSkipReason } from "./support/team-icon-db";
import { allowPageError, expect, test } from "./support/test";

/**
 * Page files from end to end: an agent of the author uploads a stylesheet,
 * two modules, a picture, and data with a page path over MCP (request, PUT
 * to file storage, finalize, attach), and the page then loads each by its
 * relative path, streamed from storage through the page host. Readers of
 * the approved version get that version's files and no later one. A second
 * test puts the same site in with the two tools for many files, then
 * brings it to a new state (one file replaced, one removed, one added) in
 * one more publish. These
 * need a local throwaway Postgres (E2E_LOCAL_DB=1) and a local
 * S3-compatible store (E2E_LOCAL_R2=1, R2_ENDPOINT on this machine), and
 * skip without them. The fixture checks (page-files.spec.ts) run everywhere,
 * with the lookup and the bytes stood in for.
 */

test.skip(!localStorageEnabled(), localStorageSkipReason);

const created: string[] = [];
const createdUsers: string[] = [];
const createdTokens: string[] = [];
let pool: Pool | null = null;

function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

test.afterAll(async () => {
  if (createdTokens.length > 0) await db().query(`delete from api_token where id = any($1)`, [createdTokens]);
  // The files go with their artifact's rows; the throwaway store keeps their objects.
  if (created.length > 0) await db().query(`delete from artifact_file where artifact_id in (select id from artifact where public_id = any($1))`, [created]);
  await pool?.end();
  pool = null;
  await cleanUp(created, createdUsers);
});

const frameSelector = "iframe[data-slot=page-frame]";

const pageHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Real page files</title><link rel="stylesheet" href="css/site.css"></head>
<body>
<p id="styled">Styled by the page's stylesheet</p>
<div id="pictured"></div>
<p id="picture">No picture</p>
<p id="module">Module did not run</p>
<p id="data">No data</p>
<p id="later">Not asked</p>
<p id="part">Not asked</p>
<script type="module" src="js/app.js"></script>
</body>
</html>`;

/** A 1 by 1 PNG. */
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const pageFiles: Record<string, Buffer> = {
  "css/site.css": Buffer.from(`#styled { color: rgb(0, 128, 0); }\n#pictured { width: 24px; height: 24px; background-image: url(../img/dot.png); }\n`),
  "js/app.js": Buffer.from(
    `import { message } from "./message.js";
document.getElementById("module").textContent = message;
const say = (id, text) => { document.getElementById(id).textContent = text; };
fetch("data.json").then((response) => response.json()).then((data) => say("data", "answer " + data.answer));
fetch("later.json").then((response) => say("later", "later " + response.status));
fetch("data.json", { headers: { Range: "bytes=0-3" } }).then(async (response) => say("part", response.status + " " + (await response.text()).length));
const picture = new Image();
picture.onload = () => say("picture", "picture " + picture.naturalWidth);
picture.src = "img/dot.png";
`,
  ),
  "js/message.js": Buffer.from(`export const message = "Module imported its sibling";\n`),
  "data.json": Buffer.from(`{"answer": 42}\n`),
  "img/dot.png": png,
};

/** An access token for `userId`, stored as the app stores one: only its hash. */
async function agentTokenFor(userId: string): Promise<string> {
  const id = randomUUID();
  const secret = `e2e-page-files-${randomUUID()}`;
  await db().query(`insert into api_token (id, user_id, name, prefix, token_hash) values ($1, $2, 'Page files e2e', 'e2e…', $3)`, [id, userId, createHash("sha256").update(secret).digest("hex")]);
  createdTokens.push(id);
  return secret;
}

interface ToolResult {
  isError?: boolean;
  content: { type: "text"; text: string }[];
}

/** Calls one tool over the real MCP endpoint, as an agent holding `token`. */
async function callTool(request: APIRequestContext, token: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const response = await request.post("/api/mcp", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  expect(response.status(), "the MCP endpoint answers").toBe(200);
  return ((await response.json()) as { result: ToolResult }).result;
}

/** A tool's answer as the JSON it returned; fails with the tool's own words when it refused. */
function answerOf(result: ToolResult): unknown {
  const text = result.content[0]?.text ?? "";
  if (result.isError) throw new Error(`The tool refused: ${text}`);
  return JSON.parse(text);
}

const fileAnswer = z.object({ id: z.string(), pagePath: z.string().optional() });
const startedAnswer = z.object({ file: fileAnswer, upload: z.object({ url: z.string(), headers: z.record(z.string(), z.string()) }) });
const finishedAnswer = z.object({ file: fileAnswer });
const artifactAnswer = z.object({ files: z.array(fileAnswer) });

/** Uploads one page file as an agent does: request with its path, PUT the bytes to storage, finalize. Returns the upload's id. */
async function uploadPageFile(request: APIRequestContext, token: string, pagePath: string, bytes: Buffer): Promise<string> {
  const started = startedAnswer.parse(answerOf(await callTool(request, token, "files_request_upload", { pagePath, size: bytes.length })));
  expect(started.file.pagePath).toBe(pagePath);
  const put = await fetch(started.upload.url, { method: "PUT", headers: started.upload.headers, body: new Uint8Array(bytes) });
  expect(put.ok, `storage took ${pagePath}`).toBe(true);
  const finished = finishedAnswer.parse(answerOf(await callTool(request, token, "files_finalize", { fileId: started.file.id })));
  expect(finished.file.pagePath).toBe(pagePath);
  return started.file.id;
}

const startedSetAnswer = z.object({
  uploads: z.array(z.object({ path: z.string(), fileId: z.string(), url: z.string(), headers: z.record(z.string(), z.string()) })),
  fileIds: z.array(z.string()),
});
const publishedAnswer = z.object({
  published: z.object({ status: z.string(), added: z.array(z.string()), replaced: z.array(z.string()), removed: z.array(z.string()) }),
  files: z.array(fileAnswer),
  baseVersion: z.string(),
});

/** Starts the uploads of a whole set in one call and PUTs each file with exactly the headers the answer gives. Returns the file ids. */
async function uploadSet(request: APIRequestContext, token: string, artifact: string, files: Record<string, Buffer>): Promise<string[]> {
  const set = Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length }));
  const started = startedSetAnswer.parse(answerOf(await callTool(request, token, "page_files_request_uploads", { artifact, files: set })));
  expect(started.uploads.map((upload) => upload.path)).toEqual(Object.keys(files));
  for (const upload of started.uploads) {
    const put = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: new Uint8Array(files[upload.path] ?? Buffer.alloc(0)) });
    expect(put.ok, `storage took ${upload.path}`).toBe(true);
  }
  return started.fileIds;
}

async function versionCount(publicId: string): Promise<number> {
  const result = await db().query<{ n: string }>(`select count(*) as n from artifact_version where artifact_id = (select id from artifact where public_id = $1)`, [publicId]);
  return Number(result.rows[0]?.n ?? 0);
}

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

/** The running page, once the site's frame shows it. */
async function runningPage(page: Page, publicId: string) {
  await page.goto(`/artifact/${publicId}`);
  await expect(page.locator(`${frameSelector}[data-page-shown]`)).toBeVisible({ timeout: 30_000 });
  return page.frameLocator(frameSelector);
}

test.describe("page files with a database and file storage", () => {
  test("should load the files an agent attached with a path, streamed from storage, and keep readers on the approved version's files", async ({ page, request }, testInfo) => {
    test.slow();
    allowPageError("Failed to load resource: the server responded with a status of 404", "The page asks for a file a reader of the approved version does not have, on purpose.");
    const userId = await signIn(page);
    const token = await agentTokenFor(userId);
    const publicId = await createTestArtifact({ userId, title: `Page files ${testInfo.project.name} ${String(Date.now())}`, content: pageHtml, visibility: "public", theme: null, kind: "html" });
    created.push(publicId);

    // The agent uploads every file with its path and attaches them in one call.
    const ids: string[] = [];
    for (const [pagePath, bytes] of Object.entries(pageFiles)) ids.push(await uploadPageFile(request, token, pagePath, bytes));
    const attached = artifactAnswer.parse(answerOf(await callTool(request, token, "files_attach", { artifact: publicId, files: ids })));
    expect(attached.files.map((file) => file.pagePath).sort()).toEqual(Object.keys(pageFiles).sort());

    // A second file at one path is refused, and so is a page file for an artifact that is no page.
    const twin = await uploadPageFile(request, token, "css/Site.css", Buffer.from("body { color: red; }\n"));
    const refused = await callTool(request, token, "files_attach", { artifact: publicId, files: [twin] });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain("already has a file at css/Site.css");
    const note = await createTestArtifact({ userId, title: "Not a page", content: "Notes", visibility: "private", theme: null });
    created.push(note);
    const wrongKind = await callTool(request, token, "files_attach", { artifact: note, files: [twin] });
    expect(wrongKind.isError).toBe(true);
    expect(wrongKind.content[0]?.text).toContain("Page files belong to an HTML artifact");

    // The author sees the page with its files.
    const authors = await runningPage(page, publicId);
    await expect(authors.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
    await expect(authors.locator("#module")).toHaveText("Module imported its sibling");
    await expect(authors.locator("#data")).toHaveText("answer 42");
    await expect(authors.locator("#picture")).toHaveText("picture 1");
    await expect(authors.locator("#pictured")).toHaveCSS("background-image", /\/img\/dot\.png"\)$/);
    await expect(authors.locator("#part")).toHaveText("206 4");
    await expect(authors.locator("#later")).toHaveText("later 404");
    const src = new URL((await page.locator(frameSelector).getAttribute("src")) ?? "");
    expect(src.pathname).toMatch(/^\/f\/[A-Za-z0-9_-]{60,400}\/index\.html$/);

    // The site's own file route never shows a script inline: it sends a download.
    const scriptId = ids[Object.keys(pageFiles).indexOf("js/app.js")] ?? "";
    const direct = await request.get(`/api/files/${scriptId}`, { maxRedirects: 0 });
    expect(direct.status()).toBe(302);
    expect(decodeURIComponent(new URL(direct.headers().location ?? "").searchParams.get("response-content-disposition") ?? "")).toMatch(/^attachment;/);

    // Readers are served the version approved now. A file attached after it reaches the author only.
    await db().query(
      `with filed as (insert into artifact_version (id, artifact_id, title, content, kind, created_by, save_kind) select $1, id, title, content, kind, user_id, 'files' from artifact where public_id = $2 returning id, artifact_id)
       update artifact set approved_version_id = filed.id from filed where artifact.id = filed.artifact_id`,
      [randomUUID(), publicId],
    );
    const later = await uploadPageFile(request, token, "later.json", Buffer.from(`{"later": true}\n`));
    await db().query(`update artifact_file set artifact_id = (select id from artifact where public_id = $2), attached_at = now() where id = $1`, [later, publicId]);

    const again = await runningPage(page, publicId);
    await expect(again.locator("#later")).toHaveText("later 200");

    await page.context().clearCookies();
    const readers = await runningPage(page, publicId);
    await expect(readers.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
    await expect(readers.locator("#module")).toHaveText("Module imported its sibling");
    await expect(readers.locator("#data")).toHaveText("answer 42");
    await expect(readers.locator("#picture")).toHaveText("picture 1");
    await expect(readers.locator("#later")).toHaveText("later 404");

    // The address the reader's frame holds is for the approved version: it never serves the later file.
    const readersSrc = new URL((await page.locator(frameSelector).getAttribute("src")) ?? "");
    const site = new URL(testInfo.project.use.baseURL ?? "").origin;
    const ask = (path: string) => request.fetch(`${site}${readersSrc.pathname.replace(/index\.html$/, path)}`, { headers: { host: readersSrc.host }, maxRedirects: 0 });
    expect((await ask("later.json")).status()).toBe(404);
    const data = await ask("data.json");
    expect(data.status()).toBe(200);
    expect(data.headers()["content-type"]).toBe("application/json; charset=utf-8");
    expect(data.headers()["cache-control"]).toMatch(/^private, max-age=\d+$/);
    expect(data.headers().location).toBeUndefined();
    expect(await data.text()).toBe(`{"answer": 42}\n`);
  });

  test("should put a whole site in with two calls and the PUTs, then bring it to a new state with one more publish", async ({ page, request }, testInfo) => {
    test.slow();
    allowPageError("Failed to load resource: the server responded with a status of 404", "The page asks for a file that is added only by the second publish, on purpose.");
    const userId = await signIn(page);
    const token = await agentTokenFor(userId);
    const publicId = await createTestArtifact({ userId, title: `Page file set ${testInfo.project.name} ${String(Date.now())}`, content: pageHtml, visibility: "private", theme: null, kind: "html" });
    created.push(publicId);

    // A set with one file at fault starts nothing, and the one refusal names it.
    const refused = await callTool(request, token, "page_files_request_uploads", { artifact: publicId, files: [{ path: "css/site.css", size: 10 }, { path: "pages/about.html", size: 10 }] });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain("pages/about.html");
    expect(refused.content[0]?.text).not.toContain("css/site.css:");

    // One call starts every upload; one call publishes them together, as one version.
    const before = await versionCount(publicId);
    const ids = await uploadSet(request, token, publicId, pageFiles);
    const first = publishedAnswer.parse(answerOf(await callTool(request, token, "page_files_publish", { artifact: publicId, uploads: ids })));
    expect(first.published).toEqual({ status: "applied", added: Object.keys(pageFiles), replaced: [], removed: [] });
    expect(first.files.map((file) => file.pagePath).sort()).toEqual(Object.keys(pageFiles).sort());
    expect((await versionCount(publicId)) - before).toBeLessThanOrEqual(2);

    const shown = await runningPage(page, publicId);
    await expect(shown.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
    await expect(shown.locator("#module")).toHaveText("Module imported its sibling");
    await expect(shown.locator("#data")).toHaveText("answer 42");
    await expect(shown.locator("#picture")).toHaveText("picture 1");
    await expect(shown.locator("#later")).toHaveText("later 404");

    // A new state in one step: the stylesheet replaced, the picture removed, later.json added.
    const next = { "css/site.css": Buffer.from("#styled { color: rgb(0, 0, 255); }\n"), "later.json": Buffer.from(`{"later": true}\n`) };
    const nextIds = await uploadSet(request, token, publicId, next);
    const versionsBefore = await versionCount(publicId);
    const second = publishedAnswer.parse(answerOf(await callTool(request, token, "page_files_publish", { artifact: publicId, uploads: nextIds, remove: ["img/dot.png"], baseVersion: first.baseVersion })));
    expect(second.published).toEqual({ status: "applied", added: ["later.json"], replaced: ["css/site.css"], removed: ["img/dot.png"] });
    expect(await versionCount(publicId)).toBe(versionsBefore + 1);

    // A publish built on the older save is refused, and changes nothing.
    const stale = await callTool(request, token, "page_files_publish", { artifact: publicId, remove: ["data.json"], baseVersion: first.baseVersion });
    expect(stale.isError).toBe(true);

    allowPageError("Failed to load resource: the server responded with a status of 404", "The picture was removed by the publish, on purpose.");
    const after = await runningPage(page, publicId);
    await expect(after.locator("#styled")).toHaveCSS("color", "rgb(0, 0, 255)");
    await expect(after.locator("#later")).toHaveText("later 200");
    await expect(after.locator("#data")).toHaveText("answer 42");
    await expect(after.locator("#picture")).toHaveText("No picture");
  });
});
