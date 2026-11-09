import { drizzle } from "drizzle-orm/pg-proxy";
import { NextRequest } from "next/server";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as notificationSchema from "@/db/notification-schema";
import * as oauthSchema from "@/db/oauth-schema";
import * as rolesSchema from "@/db/roles-schema";
import * as appSchema from "@/db/schema";
import * as viewsSchema from "@/db/views-schema";
import type * as VersionCache from "@/lib/versions/cache";

/*
 * Pins how many database queries one anonymous view of a public artifact
 * page costs, so duplicate reads cannot creep back. The proxy (its own
 * invocation) and the page (generateMetadata and the page body, one request)
 * run against a database driver that records every statement. React's
 * per-request cache is simulated: memoized within one request, fresh for the
 * next. The approved version's content is cached across requests
 * (src/lib/versions/cache.ts), so it is stubbed as a warm cache here.
 *
 * Child components are not rendered; on an anonymous view of an approved
 * version they read nothing from the database (ApprovedArticle renders from
 * the version cache).
 */

const mocks = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  scope: new WeakMap<object, Map<string, unknown>>(),
  getAuth: vi.fn(),
}));

/** React.cache as the server sees it: one memo per request (newRequest() starts the next). */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  function cache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A) => {
      const memo = mocks.scope.get(fn) ?? new Map<string, unknown>();
      mocks.scope.set(fn, memo);
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key) as R;
    };
  }
  return { ...actual, cache };
});

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const author = "author-1";

/** The stored rows the fake database answers with, by "table.column". Everything else is null. */
const columns: Record<string, unknown> = {
  "artifact.id": "artifact-1",
  "artifact.public_id": publicId,
  "artifact.share_id": "share-1",
  "artifact.user_id": author,
  "artifact.updated_by": author,
  "artifact.team_id": "team-1",
  "artifact.visibility": "public",
  "artifact.show_in_search": true,
  "artifact.approved_version_id": "version-1",
  "artifact.title": "Plan",
  "artifact.summary": "",
  "artifact.kind": "markdown",
  "artifact.language": "",
  "artifact.source": "",
  "artifact.project": "",
  "artifact.session_id": "",
  "artifact.comments": "team",
  "artifact.metadata": {},
  "artifact.tags": [],
  "artifact.full_width": false,
  "artifact.created_at": "2026-10-01T00:00:00Z",
  "artifact.updated_at": "2026-10-02T00:00:00Z",
  "team.personal": false,
  "artifact_version.title": "Plan",
  "artifact_version.saved_at": "2026-10-02T00:00:00Z",
  "artifact_version.created_by": author,
};

/** The selected column list of a statement, as "table.column" keys (or the raw expression). */
function selectedKeys(statement: string): string[] {
  const body = statement.replace(/^select (distinct )?/, "");
  const fromAt = body.search(/ from "/);
  const table = /^"(\w+)"/.exec(body.slice(fromAt + 6))?.[1] ?? "";
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body.slice(0, fromAt)) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  parts.push(current.trim());
  return parts.map((part) => {
    const qualified = /^"(\w+)"\."(\w+)"$/.exec(part);
    if (qualified) return `${qualified[1] ?? ""}.${qualified[2] ?? ""}`;
    const bare = /^"(\w+)"$/.exec(part);
    return bare ? `${table}.${bare[1] ?? ""}` : part;
  });
}

/** One row for reads of the artifact itself (the page check, the read decision) and of the account age, none for anything else. */
function answer(statement: string): unknown[][] {
  if (!statement.startsWith("select ") || !/ from "artifact"|^select coalesce\(/.test(statement)) return [];
  return [selectedKeys(statement).map((key) => (key.startsWith("coalesce(") ? "2020-01-01T00:00:00Z" : columns[key] ?? null))];
}

const fakeDb = drizzle(
  (statement, params, method) => {
    mocks.statements.push({ sql: statement, params });
    // db.execute (the rate limit) gets its result object; selects get rows in column order.
    return Promise.resolve(method === "execute" ? { rows: { rows: [] } as unknown as unknown[] } : { rows: answer(statement) });
  },
  { schema: { ...appSchema, ...oauthSchema, ...viewsSchema, ...notificationSchema, ...rolesSchema } },
);

vi.mock("@/db", () => ({ getDb: () => fakeDb }));
vi.mock("@/lib/session", () => ({ getSession: () => Promise.resolve(null) }));
vi.mock("@/lib/auth/server", () => ({ getAuth: mocks.getAuth }));
vi.mock("@/lib/versions/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof VersionCache>()),
  cachedVersionView: () =>
    Promise.resolve({ title: "Plan", icon: null, theme: null, cover: null, summary: "A plan.", content: "# Plan", kind: "markdown", language: "", source: "", metadata: {}, updatedAt: new Date("2026-10-02T00:00:00Z") }),
}));

const { proxy } = await import("@/proxy");
const page = await import("./page");

/** Starts a new request: React's per-request cache is empty again. */
function newRequest() {
  mocks.scope = new WeakMap();
  const before = mocks.statements.length;
  return () => mocks.statements.slice(before);
}

async function viewProxy() {
  const statements = newRequest();
  const response = await proxy(new NextRequest(new URL(`/artifact/${publicId}`, "https://artifacts.space")));
  return { response, statements: statements() };
}

async function viewPage() {
  const statements = newRequest();
  const props = { params: Promise.resolve({ publicId }), searchParams: Promise.resolve({}) };
  const metadata = await page.generateMetadata(props);
  await page.default(props);
  return { metadata, statements: statements() };
}

function distinct(statements: { sql: string; params: unknown[] }[]) {
  return new Set(statements.map((statement) => `${statement.sql} ${JSON.stringify(statement.params)}`)).size;
}

describe("anonymous public artifact page queries", () => {
  beforeEach(() => {
    mocks.statements = [];
    mocks.getAuth.mockReset();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-network-key-secret");
    // The rate limit sometimes deletes old buckets (2% of hits); keep that out of the count.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should cost two queries in the proxy when an anonymous visitor opens a public page", async () => {
    const { response, statements } = await viewProxy();
    expect(response.status).toBe(200);
    // Indexable: the author opted in and the account is established.
    expect(response.headers.get("x-robots-tag")).toBeNull();
    // The rate limit, then one read of the artifact with its search setting and account age.
    expect(statements).toHaveLength(2);
    expect(statements.filter((statement) => statement.sql.includes(' from "artifact"'))).toHaveLength(1);
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it("should cost six queries for the page and its metadata when an anonymous visitor opens a public page", async () => {
    const { metadata, statements } = await viewPage();
    expect(metadata.robots).toEqual({ index: true, follow: false });
    // The read decision, the team (theme), the author (byline and last editor), files, hidden images, account age.
    expect(statements).toHaveLength(6);
    expect(distinct(statements)).toBe(statements.length);
  });

  it("should read the artifact row once for the page, its metadata, and its link preview tags", async () => {
    const { statements } = await viewPage();
    expect(statements.filter((statement) => statement.sql.includes(' from "artifact"'))).toHaveLength(1);
    expect(statements.filter((statement) => statement.sql.includes(' from "team"'))).toHaveLength(1);
    expect(statements.filter((statement) => statement.sql.includes('coalesce("owner"."created_at"'))).toHaveLength(1);
  });

  it("should read everything again on the next request, so no access decision outlives its request", async () => {
    const first = await viewPage();
    const second = await viewPage();
    expect(second.statements).toHaveLength(first.statements.length);
  });
});
