import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/user-facing-error";

/*
 * The project actions behind the sidebar's Projects group. Each one acts as
 * the signed-in person, never as anyone the browser names, and fails closed:
 * signed out, outside the team, or not allowed to manage the project, nothing
 * changes. The session, team lookup, and project store are mocked at their
 * boundaries; the store's own scope checks are tested in src/lib/projects.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  teamForMember: vi.fn(),
  createProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
  setArtifactProject: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/queries", () => ({ getTeamForMember: mocks.teamForMember }));
vi.mock("@/lib/projects/manage", () => ({
  createProject: mocks.createProject,
  renameProject: mocks.renameProject,
  deleteProject: mocks.deleteProject,
  mergeProjects: vi.fn(),
  setProjectIcon: vi.fn(),
  listArtifactProjects: vi.fn(),
}));
vi.mock("@/lib/projects/store", () => ({ setArtifactProject: mocks.setArtifactProject }));

const actions = await import("./project-actions");

const signedIn = (id: string) => ({ user: { id } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(signedIn("viewer"));
});

describe("project actions when signed out", () => {
  it("should change nothing and ask to sign in when there is no session", async () => {
    mocks.session.mockResolvedValue(null);
    const results = await Promise.all([
      actions.createProjectAction({ teamSlug: null }, { name: "Design", icon: null }),
      actions.renameProjectAction("p1", "Specs"),
      actions.deleteProjectAction("p1"),
      actions.setArtifactProjectAction("a1", { none: true }),
    ]);
    for (const result of results) expect(result).toEqual({ success: false, error: "Your session ended. Sign in again." });
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.renameProject).not.toHaveBeenCalled();
    expect(mocks.deleteProject).not.toHaveBeenCalled();
    expect(mocks.setArtifactProject).not.toHaveBeenCalled();
  });
});

describe("createProjectAction", () => {
  it("should refuse and create nothing when the person is not in the team", async () => {
    mocks.teamForMember.mockResolvedValue(null);
    const result = await actions.createProjectAction({ teamSlug: "acme" }, { name: "Launch", icon: null });
    expect(result).toEqual({ success: false, error: "Team not found." });
    expect(mocks.teamForMember).toHaveBeenCalledWith("viewer", "acme");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("should refuse a personal team when someone names one", async () => {
    mocks.teamForMember.mockResolvedValue({ id: "t-personal", personal: true });
    const result = await actions.createProjectAction({ teamSlug: "viewer-personal" }, { name: "Launch", icon: null });
    expect(result.success).toBe(false);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("should create in the team's scope as the signed-in member when they are in the team", async () => {
    mocks.teamForMember.mockResolvedValue({ id: "t-acme", personal: false });
    mocks.createProject.mockResolvedValue({ id: "p1", name: "Launch", icon: null });
    await expect(actions.createProjectAction({ teamSlug: "acme" }, { name: "Launch", icon: null })).resolves.toMatchObject({ success: true });
    expect(mocks.createProject).toHaveBeenCalledWith("viewer", { kind: "team", teamId: "t-acme" }, { name: "Launch", icon: null });
  });

  it("should create in the person's own scope when no team is named", async () => {
    mocks.createProject.mockResolvedValue({ id: "p1", name: "Design", icon: null });
    await actions.createProjectAction({ teamSlug: null }, { name: "Design", icon: null });
    expect(mocks.createProject).toHaveBeenCalledWith("viewer", { kind: "user", userId: "viewer" }, { name: "Design", icon: null });
  });
});

describe("renameProjectAction and deleteProjectAction", () => {
  it("should act as the signed-in person and pass on a not-found refusal when they may not manage the project", async () => {
    mocks.session.mockResolvedValue(signedIn("stranger"));
    mocks.renameProject.mockRejectedValue(new UserFacingError("Project not found."));
    mocks.deleteProject.mockRejectedValue(new UserFacingError("Project not found."));
    await expect(actions.renameProjectAction("p1", "Mine now")).resolves.toEqual({ success: false, error: "Project not found." });
    await expect(actions.deleteProjectAction("p1")).resolves.toEqual({ success: false, error: "Project not found." });
    expect(mocks.renameProject).toHaveBeenCalledWith("stranger", "p1", "Mine now");
    expect(mocks.deleteProject).toHaveBeenCalledWith("stranger", "p1");
  });

  it("should refuse an empty project id before reaching the store", async () => {
    await expect(actions.deleteProjectAction("   ")).resolves.toMatchObject({ success: false });
    expect(mocks.deleteProject).not.toHaveBeenCalled();
  });
});

describe("setArtifactProjectAction", () => {
  it("should answer not found and report no change when the person may not edit the artifact", async () => {
    mocks.setArtifactProject.mockResolvedValue(undefined);
    const result = await actions.setArtifactProjectAction("a1", { name: "Design" });
    expect(result).toEqual({ success: false, error: "Artifact not found, or you cannot edit it." });
    expect(mocks.setArtifactProject).toHaveBeenCalledWith("viewer", "a1", { name: "Design" });
  });

  it("should refuse a malformed choice before reaching the store", async () => {
    const result = await actions.setArtifactProjectAction("a1", { name: "" });
    expect(result.success).toBe(false);
    expect(mocks.setArtifactProject).not.toHaveBeenCalled();
  });
});
