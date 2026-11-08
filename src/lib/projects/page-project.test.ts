import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactAccess } from "@/lib/access";

const mocks = vi.hoisted(() => ({ projectsForViewer: vi.fn(), tagsForViewer: vi.fn() }));
vi.mock("./queries", () => ({ projectsForViewer: mocks.projectsForViewer }));
vi.mock("@/lib/tags/queries", () => ({ tagsForViewer: mocks.tagsForViewer }));

const { pageOrganizersFor } = await import("./page-project");

const record = { id: "a1", userId: "author", visibility: "public", teamId: "acme", projectId: "p1", tags: ["launch"] } as unknown as ArtifactAccess["record"];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.projectsForViewer.mockResolvedValue(new Map([["a1", { id: "p1", name: "Billing", icon: null }]]));
  mocks.tagsForViewer.mockResolvedValue(new Map([["a1", ["launch"]]]));
});

describe("pageOrganizersFor", () => {
  it("should give the project and tags to someone who may edit the artifact", async () => {
    await expect(pageOrganizersFor({ canEdit: true, record }, "author")).resolves.toEqual({ project: { id: "p1", name: "Billing", icon: null }, tags: ["launch"] });
  });

  it("should load nothing for a reader outside the team of a public page", async () => {
    await expect(pageOrganizersFor({ canEdit: false, record }, "stranger")).resolves.toBeUndefined();
    expect(mocks.projectsForViewer).not.toHaveBeenCalled();
    expect(mocks.tagsForViewer).not.toHaveBeenCalled();
  });

  it("should load nothing for a signed-out reader", async () => {
    await expect(pageOrganizersFor({ canEdit: true, record }, null)).resolves.toBeUndefined();
    expect(mocks.tagsForViewer).not.toHaveBeenCalled();
  });

  it("should mean no project and no tags when an editor's artifact has none", async () => {
    mocks.projectsForViewer.mockResolvedValue(new Map([["a1", null]]));
    mocks.tagsForViewer.mockResolvedValue(new Map([["a1", []]]));
    await expect(pageOrganizersFor({ canEdit: true, record }, "author")).resolves.toEqual({ project: null, tags: [] });
  });
});
