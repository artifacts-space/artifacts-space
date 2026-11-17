import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * One files_attach call with page files and plain files: both attach, or
 * neither. The two attaches and the page file store are mocked at their
 * module boundaries.
 */

const pages = vi.hoisted(() => ({ pageUploadsAmong: vi.fn(), attachPageUploads: vi.fn() }));
const pageStore = vi.hoisted(() => ({ detachPageFileRows: vi.fn() }));
const store = vi.hoisted(() => ({ getFileRows: vi.fn(), countArtifactFiles: vi.fn(), attachFileRows: vi.fn() }));
const versions = vi.hoisted(() => ({ recordArtifactChange: vi.fn() }));

vi.mock("@/lib/page-files/attach", () => pages);
vi.mock("@/lib/page-files/store", () => pageStore);
vi.mock("./store", () => store);
vi.mock("./icon-cleanup", () => ({ countHistoryOnlyFiles: vi.fn() }));
vi.mock("./copies", () => ({ removeCopiesOf: vi.fn() }));
vi.mock("@/lib/access", () => ({ canEditRecord: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("no database in this test"); } }));
vi.mock("@/lib/versions/save-write", () => versions);
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

const { attachFiles } = await import("./attach");

const pageId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const plainId = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  vi.resetAllMocks();
  pages.pageUploadsAmong.mockResolvedValue([{ id: pageId, pagePath: "css/site.css" }]);
  pages.attachPageUploads.mockResolvedValue([pageId]);
  pageStore.detachPageFileRows.mockResolvedValue(undefined);
  store.getFileRows.mockResolvedValue([{ id: plainId, status: "ready", uploaderId: "author", artifactId: null, pagePath: null }]);
  store.countArtifactFiles.mockResolvedValue(0);
  store.attachFileRows.mockResolvedValue(1);
  versions.recordArtifactChange.mockResolvedValue({ status: "applied", record: { id: "a1" } });
});

describe("attachFiles with page files and plain files", () => {
  it("should attach both and record one change", async () => {
    await expect(attachFiles("author", "a1", [pageId, plainId], "agent")).resolves.toEqual({ id: "a1" });
    expect(store.attachFileRows).toHaveBeenCalledWith("author", "a1", [plainId]);
    expect(pageStore.detachPageFileRows).not.toHaveBeenCalled();
    expect(versions.recordArtifactChange).toHaveBeenCalledTimes(1);
  });

  it("should take the page files back out, and record nothing, when the plain files cannot be attached", async () => {
    store.attachFileRows.mockRejectedValue(new Error("the statement failed"));
    await expect(attachFiles("author", "a1", [pageId, plainId], "agent")).rejects.toThrow("the statement failed");
    expect(pageStore.detachPageFileRows).toHaveBeenCalledWith("a1", [pageId]);
    expect(versions.recordArtifactChange).not.toHaveBeenCalled();
  });

  it("should attach no plain file when the page files are refused", async () => {
    pages.attachPageUploads.mockRejectedValue(new Error("The page already has a file at css/site.css"));
    await expect(attachFiles("author", "a1", [pageId, plainId], "agent")).rejects.toThrow("already has a file");
    expect(store.attachFileRows).not.toHaveBeenCalled();
    expect(versions.recordArtifactChange).not.toHaveBeenCalled();
  });

  it("should check the plain files before anything is attached", async () => {
    store.getFileRows.mockResolvedValue([{ id: plainId, status: "ready", uploaderId: "someone-else", artifactId: null, pagePath: null }]);
    await expect(attachFiles("author", "a1", [pageId, plainId], "agent")).rejects.toThrow("not yours to use here");
    expect(pages.attachPageUploads).not.toHaveBeenCalled();
    expect(store.attachFileRows).not.toHaveBeenCalled();
  });
});
