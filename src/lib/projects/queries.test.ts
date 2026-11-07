import { beforeEach, describe, expect, it, vi } from "vitest";

import { project, team } from "@/db/schema";

import type * as ScopeModule from "./scope";

/*
 * Who sees an artifact's project. The database is mocked at getDb: the
 * team rows (for personal flags) and the project rows come from fixtures.
 */

const fixtures = vi.hoisted(() => ({
  teams: [] as { id: string; personal: boolean }[],
  projects: [] as Record<string, unknown>[],
  shared: new Set<string>(),
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(table === team ? fixtures.teams : table === project ? fixtures.projects : []),
      }),
    }),
  }),
}));
vi.mock("./scope", async (importOriginal) => ({
  ...(await importOriginal<typeof ScopeModule>()),
  sharedTeamIdsFor: () => Promise.resolve(fixtures.shared),
}));

const { projectsForViewer, seesOrganizers } = await import("./queries");

function projectRow(id: string, scope: { userId?: string; teamId?: string }) {
  return { id, name: `Project ${id}`, nameKey: `project ${id}`, icon: null, userId: scope.userId ?? null, teamId: scope.teamId ?? null, createdBy: null, createdAt: new Date(), updatedAt: new Date() };
}

beforeEach(() => {
  fixtures.teams = [{ id: "acme", personal: false }, { id: "personal-a", personal: true }];
  fixtures.projects = [projectRow("mine", { userId: "author" }), projectRow("team", { teamId: "acme" })];
  fixtures.shared = new Set();
});

describe("seesOrganizers", () => {
  const subject = { userId: "author", visibility: "team" as const, teamId: "acme" };

  it("should let the author and members of the shared team see projects", () => {
    expect(seesOrganizers(subject, "author", new Set())).toBe(true);
    expect(seesOrganizers(subject, "member", new Set(["acme"]))).toBe(true);
  });

  it("should refuse a reader outside the team when the artifact is shared by link or publicly", () => {
    expect(seesOrganizers({ ...subject, visibility: "link" }, "stranger", new Set())).toBe(false);
    expect(seesOrganizers({ ...subject, visibility: "public" }, "stranger", new Set(["other-team"]))).toBe(false);
  });

  it("should refuse a teammate when the artifact is private", () => {
    expect(seesOrganizers({ ...subject, visibility: "private" }, "member", new Set(["acme"]))).toBe(false);
  });
});

describe("projectsForViewer", () => {
  it("should show the author their private artifact's own project", async () => {
    const map = await projectsForViewer([{ id: "a1", userId: "author", visibility: "private", teamId: null, projectId: "mine" }], "author");
    expect(map.get("a1")).toEqual({ id: "mine", name: "Project mine", icon: null });
  });

  it("should show a team member the team project of an artifact shared through the team", async () => {
    fixtures.shared = new Set(["acme"]);
    const map = await projectsForViewer([{ id: "a1", userId: "author", visibility: "team", teamId: "acme", projectId: "team" }], "member");
    expect(map.get("a1")?.name).toBe("Project team");
  });

  it("should show nothing to a reader outside the team when the artifact is public", async () => {
    const map = await projectsForViewer([{ id: "a1", userId: "author", visibility: "public", teamId: "acme", projectId: "team" }], "stranger");
    expect(map.get("a1")).toBeNull();
  });

  it("should never show another person's project when a link points outside the home scope", async () => {
    fixtures.shared = new Set(["acme"]);
    // A team artifact still linked to the author's private project (a sharing change that failed to move it).
    const map = await projectsForViewer([{ id: "a1", userId: "author", visibility: "team", teamId: "acme", projectId: "mine" }], "member");
    expect(map.get("a1")).toBeNull();
  });

  it("should hide a team project from the author when the artifact went private again", async () => {
    const map = await projectsForViewer([{ id: "a1", userId: "author", visibility: "private", teamId: null, projectId: "team" }], "author");
    expect(map.get("a1")).toBeNull();
  });

  it("should treat a personal team as the author's own scope", async () => {
    fixtures.projects.push(projectRow("personal-team-project", { teamId: "personal-a" }));
    const map = await projectsForViewer(
      [
        { id: "a1", userId: "author", visibility: "link", teamId: "personal-a", projectId: "mine" },
        { id: "a2", userId: "author", visibility: "link", teamId: "personal-a", projectId: "personal-team-project" },
      ],
      "author",
    );
    expect(map.get("a1")?.id).toBe("mine");
    expect(map.get("a2")).toBeNull();
  });

  it("should map artifacts without a project to null without querying", async () => {
    const map = await projectsForViewer([{ id: "a1", userId: "author", visibility: "private", teamId: null, projectId: null }], "author");
    expect(map.get("a1")).toBeNull();
  });
});
