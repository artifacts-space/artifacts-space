import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact, artifactVersion, project, team } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import { createFakeDb } from "./fake-db";
import type { ProjectScope } from "./rules";

import type * as ScopeModule from "./scope";

/*
 * Moving artifacts between projects, against an in-memory database. The
 * edit check (getEditableArtifact) and the rate limit are mocked at their
 * module boundary.
 */

const state = vi.hoisted((): { db: unknown; editable: Record<string, unknown> | null } => ({ db: null, editable: null }));
const mocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn(), recordArtifactSave: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: () => Promise.resolve(state.editable) }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
// Scope membership: the author uses their own projects; "author" and "teammate" are in acme.
vi.mock("./scope", async (importOriginal) => ({
  ...(await importOriginal<typeof ScopeModule>()),
  canUseScope: (viewerId: string, scope: ProjectScope) =>
    Promise.resolve(scope.kind === "user" ? scope.userId === viewerId : ["author", "teammate"].includes(viewerId) && scope.teamId === "acme"),
}));

const { findOrCreateProject, rehomeArtifactProject, setArtifactProject } = await import("./store");

type Row = Record<string, unknown>;
let tables: Map<unknown, Row[]>;
let log: ReturnType<typeof createFakeDb>["log"];

const updatedAt = new Date("2026-11-01T00:00:00Z");

function artifactRow(overrides: Row = {}): Row {
  return { id: "a1", userId: "author", visibility: "private", teamId: null, projectId: null, updatedAt, updatedBy: "author", ...overrides };
}

function projectRow(id: string, name: string, scope: { userId?: string; teamId?: string }): Row {
  return { id, name, nameKey: name.toLowerCase(), icon: null, userId: scope.userId ?? null, teamId: scope.teamId ?? null };
}

beforeEach(() => {
  vi.resetAllMocks();
  tables = new Map<unknown, Row[]>([
    [project, [projectRow("p-author", "Billing", { userId: "author" }), projectRow("p-other-user", "Secret", { userId: "someone-else" }), projectRow("p-acme", "Launch", { teamId: "acme" }), projectRow("p-globex", "Roadmap", { teamId: "globex" })]],
    [artifact, [artifactRow()]],
    [team, [{ id: "acme", name: "Acme", personal: false }, { id: "globex", name: "Globex", personal: false }, { id: "personal", name: "Personal", personal: true }]],
    [artifactVersion, []],
  ]);
  const fake = createFakeDb(tables);
  state.db = fake.db;
  log = fake.log;
  state.editable = tables.get(artifact)?.[0] ?? null;
});

function current() {
  return tables.get(artifact)?.[0];
}

describe("setArtifactProject", () => {
  it("should answer not found and change nothing when the person may not edit the artifact", async () => {
    state.editable = null;
    await expect(setArtifactProject("stranger", "a1", { name: "Billing" })).resolves.toBeUndefined();
    expect(log).toEqual([]);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("should reuse the author's project when the name matches without regard to case", async () => {
    const result = await setArtifactProject("author", "a1", { name: "BILLING" });
    expect(result?.id).toBe("p-author");
    expect(current()?.projectId).toBe("p-author");
    expect(tables.get(project)).toHaveLength(4);
  });

  it("should create the project among the author's own when a private artifact gets a new name", async () => {
    const result = await setArtifactProject("author", "a1", { name: "Research" });
    const created = tables.get(project)?.find((row) => row.name === "Research");
    expect(created).toMatchObject({ userId: "author", teamId: null, nameKey: "research", createdBy: "author" });
    expect(result?.id).toBe(created?.id);
  });

  it("should create the project in the team when the artifact is shared through a shared team", async () => {
    state.editable = Object.assign(current() ?? {}, { visibility: "team", teamId: "acme" });
    await setArtifactProject("teammate", "a1", { name: "Research" });
    expect(tables.get(project)?.find((row) => row.name === "Research")).toMatchObject({ userId: null, teamId: "acme" });
  });

  it("should refuse another person's project when it is chosen by id", async () => {
    await expect(setArtifactProject("author", "a1", { projectId: "p-other-user" })).rejects.toBeInstanceOf(UserFacingError);
    expect(current()?.projectId).toBeNull();
  });

  it("should refuse a cross-space move, say how to share first, and write nothing when a private artifact goes to a team project", async () => {
    await expect(setArtifactProject("author", "a1", { projectId: "p-acme" })).rejects.toThrow("Share it with Acme first to put it in Launch.");
    expect(current()?.projectId).toBeNull();
    expect(log).toEqual([]);
    expect(tables.get(project)).toHaveLength(4);
  });

  it("should refuse the author's own project, say to stop sharing first, and write nothing when the artifact lives in a team", async () => {
    state.editable = Object.assign(current() ?? {}, { visibility: "team", teamId: "acme" });
    await expect(setArtifactProject("author", "a1", { projectId: "p-author" })).rejects.toThrow("Stop sharing it with Acme first to put it in Billing.");
    expect(current()?.projectId).toBeNull();
    expect(log).toEqual([]);
  });

  it("should answer not found without naming the team when the editor is not in the project's team", async () => {
    const error = await setArtifactProject("author", "a1", { projectId: "p-globex" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UserFacingError);
    expect(String(error)).toContain("Project not found");
    expect(String(error)).not.toContain("Globex");
    expect(log).toEqual([]);
  });

  it("should never make a look-alike project when a move by id is refused", async () => {
    await expect(setArtifactProject("author", "a1", { projectId: "p-acme" })).rejects.toBeInstanceOf(UserFacingError);
    expect(tables.get(project)?.filter((row) => row.nameKey === "launch")).toHaveLength(1);
  });

  it("should clear the project when none is chosen", async () => {
    Object.assign(current() ?? {}, { projectId: "p-author" });
    await expect(setArtifactProject("author", "a1", { none: true })).resolves.toBeNull();
    expect(current()?.projectId).toBeNull();
  });

  it("should file no version and keep the save time when an artifact moves", async () => {
    await setArtifactProject("author", "a1", { name: "Billing" });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
    expect(tables.get(artifactVersion)).toEqual([]);
    expect(current()).toMatchObject({ updatedAt, updatedBy: "author" });
    const writes = log.filter((entry) => entry.table === artifact);
    expect(writes).toEqual([{ op: "update", table: artifact, values: { projectId: "p-author", project: "" } }]);
  });

  it("should clear the deprecated label when an artifact moves", async () => {
    Object.assign(current() ?? {}, { project: "Old label" });
    await setArtifactProject("author", "a1", { none: true });
    expect(current()?.project).toBe("");
  });

  it("should refuse the move and change nothing when the sharing changed after the artifact was read", async () => {
    state.editable = { ...current() };
    Object.assign(current() ?? {}, { visibility: "team", teamId: "acme" });
    await expect(setArtifactProject("author", "a1", { name: "Billing" })).rejects.toThrow("sharing changed just now");
    expect(current()?.projectId).toBeNull();
  });

  it("should count the change against the organize limit", async () => {
    await setArtifactProject("author", "a1", { name: "Billing" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("organize", "author");
  });
});

describe("findOrCreateProject", () => {
  it("should refuse a new project when the scope is at the runaway cap", async () => {
    const rows = tables.get(project) ?? [];
    for (let index = 0; index < 1000; index += 1) rows.push(projectRow(`bulk-${String(index)}`, `bulk ${String(index)}`, { userId: "busy" }));
    await expect(findOrCreateProject({ kind: "user", userId: "busy" }, "One more", "busy")).rejects.toThrow("Merge or delete some first");
  });
});

describe("rehomeArtifactProject", () => {
  it("should move the link to the team's project of the same name when the artifact is shared with a team", async () => {
    Object.assign(current() ?? {}, { projectId: "p-author", visibility: "team", teamId: "acme" });
    await rehomeArtifactProject("a1");
    const teamProject = tables.get(project)?.find((row) => row.teamId === "acme" && row.nameKey === "billing");
    expect(teamProject).toMatchObject({ createdBy: "author" });
    expect(current()?.projectId).toBe(teamProject?.id);
  });

  it("should move the link back to the author's project when a team artifact turns private", async () => {
    Object.assign(current() ?? {}, { projectId: "p-acme", visibility: "private", teamId: null });
    await rehomeArtifactProject("a1");
    const own = tables.get(project)?.find((row) => row.userId === "author" && row.nameKey === "launch");
    expect(own).toBeDefined();
    expect(current()?.projectId).toBe(own?.id);
  });

  it("should keep the link when the home scope did not change", async () => {
    Object.assign(current() ?? {}, { projectId: "p-author", visibility: "link", teamId: "personal" });
    await rehomeArtifactProject("a1");
    expect(current()?.projectId).toBe("p-author");
    expect(log).toEqual([]);
  });
});
