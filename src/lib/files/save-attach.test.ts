import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Which uploads a save marks as attached by content: only the ones its
 * content names, never its icon or cover, so an icon is never pruned as
 * unused media. The checks and the store are mocked at their boundary.
 */

const store = vi.hoisted(() => ({ attachFileRows: vi.fn() }));
const checks = vi.hoisted(() => ({ checkContentFiles: vi.fn(), checkIconFile: vi.fn(), checkCoverFile: vi.fn() }));
vi.mock("./store", () => store);
vi.mock("./attach", () => ({ checkContentFiles: checks.checkContentFiles }));
vi.mock("./icon-file", () => ({ checkIconFile: checks.checkIconFile }));
vi.mock("./cover-file", () => ({ checkCoverFile: checks.checkCoverFile }));

const { checkUpdatedContentFiles } = await import("./save-attach");

const media = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const icon = "0f8fad5b-d9cb-469f-a165-70867728950e";
const cover = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const current = { id: "a1", kind: "markdown" as const, content: "old" };

beforeEach(() => {
  vi.resetAllMocks();
  checks.checkContentFiles.mockResolvedValue([media]);
  checks.checkIconFile.mockResolvedValue([icon]);
  checks.checkCoverFile.mockResolvedValue([cover]);
});

describe("checkUpdatedContentFiles", () => {
  it("should check the new content when a save changes it, and attach nothing yet", async () => {
    const files = await checkUpdatedContentFiles("u1", current, { content: `![x](/api/files/${media})` });
    expect(checks.checkContentFiles).toHaveBeenCalledWith("u1", "a1", "markdown", `![x](/api/files/${media})`);
    expect(files).toEqual({ contentFileIds: [media], imageFileIds: [icon, cover] });
    expect(store.attachFileRows).not.toHaveBeenCalled();
  });

  it("should name no content media when a save changes only the icon", async () => {
    const files = await checkUpdatedContentFiles("u1", current, { icon: `/api/files/${icon}` });
    expect(checks.checkContentFiles).not.toHaveBeenCalled();
    expect(files).toEqual({ contentFileIds: [], imageFileIds: [icon, cover] });
  });
});
