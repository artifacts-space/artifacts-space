import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/user-facing-error";

const mocks = vi.hoisted(() => ({ getFileRow: vi.fn(), assertUsableFiles: vi.fn() }));
vi.mock("./store", () => ({ getFileRow: mocks.getFileRow }));
vi.mock("./attach", () => ({ assertUsableFiles: mocks.assertUsableFiles }));

const { checkIconFile, restorableIcon } = await import("./icon-file");

const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";
const icon = `file:${fileId}`;
const editor = "user-1";
const artifactId = "artifact-1";
const ready = { id: fileId, status: "ready", uploaderId: editor, artifactId: null, contentType: "image/png", size: 4096 };

describe("checkIconFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.assertUsableFiles.mockResolvedValue(undefined);
  });

  it("should return nothing to attach when the icon is not an uploaded image", async () => {
    await expect(checkIconFile(editor, artifactId, "🚀")).resolves.toEqual([]);
    await expect(checkIconFile(editor, artifactId, null)).resolves.toEqual([]);
    expect(mocks.getFileRow).not.toHaveBeenCalled();
  });

  it("should return the file to attach when it is the editor's own finished image", async () => {
    mocks.getFileRow.mockResolvedValue(ready);
    await expect(checkIconFile(editor, artifactId, icon)).resolves.toEqual([fileId]);
    expect(mocks.assertUsableFiles).toHaveBeenCalledWith(editor, artifactId, [fileId]);
  });

  it.each([
    ["another artifact's file", { ...ready, artifactId: "artifact-2" }],
    ["another user's file", { ...ready, uploaderId: "someone-else" }],
    ["a non-image", { ...ready, contentType: "application/pdf" }],
    ["an SVG", { ...ready, contentType: "image/svg+xml" }],
    ["an unfinalized upload", { ...ready, status: "pending" }],
    ["an oversize file", { ...ready, size: 2 * 1024 * 1024 }],
    ["a missing file", null],
  ])("should refuse %s before anything is saved", async (_label, row) => {
    mocks.getFileRow.mockResolvedValue(row);
    await expect(checkIconFile(editor, artifactId, icon)).rejects.toBeInstanceOf(UserFacingError);
    expect(mocks.assertUsableFiles).not.toHaveBeenCalled();
  });
});

describe("restorableIcon", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("should restore an image icon when the file is still this artifact's", async () => {
    mocks.getFileRow.mockResolvedValue({ ...ready, artifactId });
    await expect(restorableIcon(editor, artifactId, icon)).resolves.toBe(icon);
  });

  it("should restore no icon when the image was deleted", async () => {
    mocks.getFileRow.mockResolvedValue(null);
    await expect(restorableIcon(editor, artifactId, icon)).resolves.toBeNull();
  });

  it("should restore emoji and Tabler icons unchanged", async () => {
    await expect(restorableIcon(editor, artifactId, "tabler:bug")).resolves.toBe("tabler:bug");
  });
});
