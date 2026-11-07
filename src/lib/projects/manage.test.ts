import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact, project, team } from "@/db/schema";

import { createFakeDb } from "./fake-db";
import type { ProjectScope } from "./rules";

import type * as ScopeModule from "./scope";

/*
 * Managing projects against an in-memory database. Scope membership
 * (canUseScope) is mocked: "author" uses their own scope, "member" uses the
 * acme team's, and nobody else uses anything.
 */

const state = vi.hoisted((): { db: unknown } => ({ db: null }));
const mocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: () => Promise.resolve(null) }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("./scope", async (importOriginal) => ({
  ...(await importOriginal<typeof ScopeModule>()),
  canUseScope: (viewerId: string, scope: ProjectScope) =>
    Promise.resolve(scope.kind === "user" ? scope.userId === viewerId : viewerId === "member" && scope.teamId === "acme"),
}));

const { createProject, deleteProject, mergeProjects, renameProject, setProjectIcon } = await import("./manage");

type Row = Record<string, unknown>;
let tables: Map<unknown, Row[]>;
let log: ReturnType<typeof createFakeDb>["log"];

function projectRow(id: string, name: string, scope: { userId?: string; teamId?: string }): Row {
  return { id, name, nameKey: name.toLowerCase(), icon: null, userId: scope.userId ?? null, teamId: scope.teamId ?? null };
}

function projects() {
  return tables.get(project) ?? [];
}

beforeEach(() => {
  vi.resetAllMocks();
  tables = new Map<unknown, Row[]>([
    [project, [projectRow("billing", "Billing", { userId: "author" }), projectRow("payments", "Payments", { userId: "author" }), projectRow("launch", "Launch", { teamId: "acme" })]],
    [artifact, [{ id: "a1", projectId: "billing" }, { id: "a2", projectId: "billing" }, { id: "a3", projectId: "payments" }]],
    [team, []],
  ]);
  const fake = createFakeDb(tables);
  state.db = fake.db;
  log = fake.log;
});

describe("project management access", () => {
  it("should answer not found and change nothing when someone else manages a person's project", async () => {
    await expect(renameProject("stranger", "billing", "Mine now")).rejects.toThrow("Project not found.");
    await expect(setProjectIcon("stranger", "billing", "🚀")).rejects.toThrow("Project not found.");
    await expect(deleteProject("stranger", "billing")).rejects.toThrow("Project not found.");
    await expect(mergeProjects("stranger", "billing", "payments")).rejects.toThrow("Project not found.");
    expect(log).toEqual([]);
  });

  it("should refuse a team's project when the person is not in the team", async () => {
    await expect(renameProject("author", "launch", "Mine now")).rejects.toThrow("Project not found.");
    await expect(createProject("author", { kind: "team", teamId: "acme" }, { name: "New" })).rejects.toThrow("Project not found.");
  });

  it("should let a team member rename the team's project", async () => {
    await expect(renameProject("member", "launch", "  Launch   v2 ")).resolves.toMatchObject({ name: "Launch v2" });
    expect(projects().find((row) => row.id === "launch")).toMatchObject({ name: "Launch v2", nameKey: "launch v2" });
  });
});

describe("renameProject", () => {
  it("should refuse a name another project in the scope has, and suggest merging", async () => {
    await expect(renameProject("author", "billing", "PAYMENTS")).rejects.toThrow("Merge the two projects instead.");
  });

  it("should allow a change of letter case only when it is the same project", async () => {
    await expect(renameProject("author", "billing", "BILLING")).resolves.toMatchObject({ name: "BILLING" });
  });
});

describe("setProjectIcon", () => {
  it("should refuse an uploaded image icon", async () => {
    await expect(setProjectIcon("author", "billing", "file:0b6b3c1e-1f0a-4c3b-9a43-2d5e8f7a6b1c")).rejects.toThrow();
    expect(log).toEqual([]);
  });
});

describe("mergeProjects", () => {
  it("should move every artifact to the target and then delete the source", async () => {
    await mergeProjects("author", "billing", "payments");
    expect(tables.get(artifact)?.map((row) => row.projectId)).toEqual(["payments", "payments", "payments"]);
    expect(projects().map((row) => row.id)).toEqual(["payments", "launch"]);
    expect(log.map((entry) => entry.op)).toEqual(["update", "delete"]);
  });

  it("should refuse to merge projects of different scopes", async () => {
    await expect(mergeProjects("member", "launch", "billing")).rejects.toThrow("Project not found.");
    expect(log).toEqual([]);
  });

  it("should refuse to merge a project into itself", async () => {
    await expect(mergeProjects("author", "billing", "billing")).rejects.toThrow("Pick a different project");
  });
});

describe("deleteProject", () => {
  it("should delete only the project, never its artifacts", async () => {
    await deleteProject("author", "billing");
    expect(projects().some((row) => row.id === "billing")).toBe(false);
    expect(tables.get(artifact)).toHaveLength(3);
    // The only artifact write clears the deprecated label, so a label backfill never brings the project back.
    expect(log.filter((entry) => entry.table === artifact).map((entry) => entry.values)).toEqual([{ project: "" }]);
  });
});

describe("createProject", () => {
  it("should refuse a name that already exists in the scope", async () => {
    await expect(createProject("author", { kind: "user", userId: "author" }, { name: "billing" })).rejects.toThrow("already exists");
  });

  it("should create the project with its icon in the person's own scope", async () => {
    await expect(createProject("author", { kind: "user", userId: "author" }, { name: "Research", icon: "tabler:flask" })).resolves.toMatchObject({ name: "Research", icon: "tabler:flask" });
    expect(projects().find((row) => row.name === "Research")).toMatchObject({ userId: "author", teamId: null });
  });
});
