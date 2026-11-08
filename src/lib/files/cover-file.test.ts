import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/user-facing-error";

const mocks = vi.hoisted(() => ({ getFileRow: vi.fn(), assertUsableFiles: vi.fn() }));
vi.mock("./store", () => ({ getFileRow: mocks.getFileRow }));
vi.mock("./attach", () => ({ assertUsableFiles: mocks.assertUsableFiles }));

const { checkCoverFile, restorableCover } = await import("./cover-file");

const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";
const cover = `file:${fileId}@30`;
const editor = "user-1";
const artifactId = "artifact-1";
const ready = { id: fileId, status: "ready", uploaderId: editor, artifactId: null, contentType: "image/jpeg", size: 1_500_000 };

describe("checkCoverFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.assertUsableFiles.mockResolvedValue(undefined);
  });

  it("should return nothing to attach when the cover is a gradient or none", async () => {
    await expect(checkCoverFile(editor, artifactId, "mist")).resolves.toEqual([]);
    await expect(checkCoverFile(editor, artifactId, null)).resolves.toEqual([]);
    await expect(checkCoverFile(editor, artifactId, undefined)).resolves.toEqual([]);
    expect(mocks.getFileRow).not.toHaveBeenCalled();
  });

  it("should return the file to attach when it is the editor's own finished image, focal point and all", async () => {
    mocks.getFileRow.mockResolvedValue(ready);
    await expect(checkCoverFile(editor, artifactId, cover)).resolves.toEqual([fileId]);
    expect(mocks.getFileRow).toHaveBeenCalledWith(fileId);
    expect(mocks.assertUsableFiles).toHaveBeenCalledWith(editor, artifactId, [fileId]);
  });

  it.each([
    ["another artifact's file", { ...ready, artifactId: "artifact-2" }],
    ["another user's file", { ...ready, uploaderId: "someone-else" }],
    ["an SVG", { ...ready, contentType: "image/svg+xml" }],
    ["an unfinalized upload", { ...ready, status: "pending" }],
    ["a file over 2 MB", { ...ready, size: 3 * 1024 * 1024 }],
    ["a missing file", null],
  ])("should refuse %s before anything is saved", async (_label, row) => {
    mocks.getFileRow.mockResolvedValue(row);
    await expect(checkCoverFile(editor, artifactId, cover)).rejects.toBeInstanceOf(UserFacingError);
    expect(mocks.assertUsableFiles).not.toHaveBeenCalled();
  });
});

describe("restorableCover", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("should restore an image cover with its focal point when the file is still this artifact's", async () => {
    mocks.getFileRow.mockResolvedValue({ ...ready, artifactId });
    await expect(restorableCover(editor, artifactId, cover)).resolves.toBe(cover);
  });

  it("should restore no cover when the image was deleted", async () => {
    mocks.getFileRow.mockResolvedValue(null);
    await expect(restorableCover(editor, artifactId, cover)).resolves.toBeNull();
  });

  it("should restore gradients unchanged", async () => {
    await expect(restorableCover(editor, artifactId, "dusk")).resolves.toBe("dusk");
    expect(mocks.getFileRow).not.toHaveBeenCalled();
  });
});
