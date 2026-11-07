import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactAccess } from "@/lib/access";

const mocks = vi.hoisted(() => ({ projectsForViewer: vi.fn() }));
vi.mock("./queries", () => ({ projectsForViewer: mocks.projectsForViewer }));

const { pageProjectFor } = await import("./page-project");

const record = { id: "a1", userId: "author", visibility: "public", teamId: "acme", projectId: "p1" } as unknown as ArtifactAccess["record"];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.projectsForViewer.mockResolvedValue(new Map([["a1", { id: "p1", name: "Billing", icon: null }]]));
});

describe("pageProjectFor", () => {
  it("should give the project control to someone who may edit the artifact", async () => {
    await expect(pageProjectFor({ canEdit: true, record }, "author")).resolves.toEqual({ id: "p1", name: "Billing", icon: null });
  });

  it("should load nothing for a reader outside the team of a public page", async () => {
    await expect(pageProjectFor({ canEdit: false, record }, "stranger")).resolves.toBeUndefined();
    expect(mocks.projectsForViewer).not.toHaveBeenCalled();
  });

  it("should load nothing for a signed-out reader", async () => {
    await expect(pageProjectFor({ canEdit: true, record }, null)).resolves.toBeUndefined();
    expect(mocks.projectsForViewer).not.toHaveBeenCalled();
  });

  it("should mean no project when an editor's artifact has none", async () => {
    mocks.projectsForViewer.mockResolvedValue(new Map([["a1", null]]));
    await expect(pageProjectFor({ canEdit: true, record }, "author")).resolves.toBeNull();
  });
});
