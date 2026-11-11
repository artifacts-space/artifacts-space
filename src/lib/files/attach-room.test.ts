import { beforeEach, describe, expect, it, vi } from "vitest";

import { fileLimits } from "./config";

/*
 * The per-artifact file limit, with the file rows and the history count
 * mocked at their module boundaries.
 */

const versions = vi.hoisted(() => ({ recordArtifactChange: vi.fn() }));
const store = vi.hoisted(() => ({ usableFileRows: vi.fn(), getFileRows: vi.fn(), countArtifactFiles: vi.fn(), attachFileRows: vi.fn(), clearIconForFile: vi.fn(), getFileRow: vi.fn(), deleteFileRows: vi.fn(), removeUnattachedUpload: vi.fn() }));
const cleanup = vi.hoisted(() => ({ countHistoryOnlyFiles: vi.fn() }));

vi.mock("./store", () => store);
vi.mock("./icon-cleanup", () => cleanup);
vi.mock("./copies", () => ({ removeCopiesOf: vi.fn() }));
const access = vi.hoisted(() => ({ canEditRecord: vi.fn() }));
vi.mock("@/lib/access", () => access);
vi.mock("@/db", () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "a1" }]) }) }) }) }) }));
vi.mock("@/lib/versions/service", () => versions);
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

const { assertUsableFiles, attachFiles, checkContentFiles, deleteOwnFile } = await import("./attach");

const upload = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

beforeEach(() => {
  vi.resetAllMocks();
  store.getFileRows.mockResolvedValue([{ id: upload, status: "ready", uploaderId: "author", artifactId: null }]);
  store.usableFileRows.mockResolvedValue([{ id: upload, status: "ready", uploaderId: "author", artifactId: null }]);
  versions.recordArtifactChange.mockResolvedValue({ status: "applied", record: null });
});

describe("assertUsableFiles", () => {
  it("should accept a new cover upload when the artifact is full only of images kept for Restore", async () => {
    store.countArtifactFiles.mockResolvedValue(fileLimits.maxFilesPerArtifact);
    cleanup.countHistoryOnlyFiles.mockResolvedValue(3);
    await expect(assertUsableFiles("author", "a1", [upload])).resolves.toBeUndefined();
  });

  it("should refuse a new file when the artifact is full of files it still shows", async () => {
    store.countArtifactFiles.mockResolvedValue(fileLimits.maxFilesPerArtifact);
    cleanup.countHistoryOnlyFiles.mockResolvedValue(0);
    await expect(assertUsableFiles("author", "a1", [upload])).rejects.toThrow(/at most 20 files/);
  });

  it("should not count history images when there is room anyway", async () => {
    store.countArtifactFiles.mockResolvedValue(2);
    await expect(assertUsableFiles("author", "a1", [upload])).resolves.toBeUndefined();
    expect(cleanup.countHistoryOnlyFiles).not.toHaveBeenCalled();
  });
});

describe("checkContentFiles for Markdown", () => {
  const otherUpload = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const elsewhere = "9b2a4f43-6a7b-4a2e-8f61-3c1a9d2e7b10";
  const markdown = `![Plan](/api/files/${upload})\n\n![Theirs](/api/files/${otherUpload})\n\n[Old](/api/files/${elsewhere})`;

  it("should attach only the editor's own uploads and the artifact's files when Markdown names other files", async () => {
    // The store answers with what the author may use; a file of theirs that the Markdown does not name is left out.
    store.usableFileRows.mockResolvedValue([
      { id: upload, status: "ready", uploaderId: "author", artifactId: null },
      { id: otherUpload, status: "ready", uploaderId: "author", artifactId: "another-artifact" },
      { id: "3b241101-e2bb-4255-8caf-4136c566a962", status: "ready", uploaderId: "author", artifactId: null },
    ]);
    store.countArtifactFiles.mockResolvedValue(0);
    await expect(checkContentFiles("author", "a1", "markdown", markdown)).resolves.toEqual([upload]);
  });

  it("should never attach a file still uploading when Markdown names it", async () => {
    store.usableFileRows.mockResolvedValue([{ id: upload, status: "pending", uploaderId: "author", artifactId: null }]);
    await expect(checkContentFiles("author", "a1", "markdown", markdown)).resolves.toEqual([]);
  });

  it("should refuse the save when new uploads would go over the file limit", async () => {
    store.countArtifactFiles.mockResolvedValue(fileLimits.maxFilesPerArtifact);
    cleanup.countHistoryOnlyFiles.mockResolvedValue(0);
    await expect(checkContentFiles("author", "a1", "markdown", markdown)).rejects.toThrow(/at most 20 files/);
  });

  it("should save Markdown that links more than 50 files it cannot use, attaching only its own upload", async () => {
    const others = Array.from({ length: 60 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    const linked = [...others.map((id) => `[file](/api/files/${id})`), `![Shot](/api/files/${upload})`].join("\n\n");
    store.countArtifactFiles.mockResolvedValue(0);
    await expect(checkContentFiles("author", "a1", "markdown", linked)).resolves.toEqual([upload]);
  });

  it("should attach the editor's own upload however many links come before it", async () => {
    const many = Array.from({ length: 2000 }, (_, index) => `[f](/api/files/00000000-0000-4000-8000-${String(index).padStart(12, "0")})`).join("\n");
    store.countArtifactFiles.mockResolvedValue(0);
    await expect(checkContentFiles("author", "a1", "markdown", `${many}\n\n![Shot](/api/files/${upload})`)).resolves.toEqual([upload]);
    // The lookup reads the files the author may use, never the linked ids.
    expect(store.usableFileRows).toHaveBeenCalledWith("author", "a1");
    expect(store.getFileRows).not.toHaveBeenCalled();
  });

  it("should still refuse unknown files when the content is a ui spec", async () => {
    store.getFileRows.mockResolvedValue([]);
    const spec = JSON.stringify({ root: "i", elements: { i: { type: "Image", props: { file: elsewhere } } } });
    await expect(checkContentFiles("author", "a1", "ui", spec)).rejects.toThrow(/not yours to use here/);
  });
});

describe("attachFiles", () => {
  it("should record the agent's harness on the files save when an agent attaches files", async () => {
    store.countArtifactFiles.mockResolvedValue(0);
    store.attachFileRows.mockResolvedValue(1);
    await attachFiles("author", "a1", [upload], "agent", () => Promise.resolve({ harness: "codex", label: null }));
    expect(versions.recordArtifactChange).toHaveBeenCalledWith({ artifactId: "a1", editorId: "author", actor: "agent", harness: { harness: "codex", label: null } });
  });

  it("should record no harness when a person attaches files in the browser", async () => {
    store.countArtifactFiles.mockResolvedValue(0);
    store.attachFileRows.mockResolvedValue(1);
    await attachFiles("author", "a1", [upload], "person");
    expect(versions.recordArtifactChange).toHaveBeenCalledWith(expect.objectContaining({ harness: null }));
  });
});

describe("deleteOwnFile", () => {
  it("should record the agent's harness on the version a deletion from an artifact files", async () => {
    store.getFileRow.mockResolvedValue({ id: upload, uploaderId: "author", artifactId: "a1" });
    store.deleteFileRows.mockResolvedValue([{ id: upload, key: `files/${upload}/a.pdf` }]);
    access.canEditRecord.mockReturnValue(true);
    await deleteOwnFile("author", upload, "agent", () => Promise.resolve({ harness: "codex", label: null }));
    expect(versions.recordArtifactChange).toHaveBeenCalledWith({ artifactId: "a1", editorId: "author", actor: "agent", harness: { harness: "codex", label: null } });
  });

  it("should record no harness when a person deletes a file in the browser", async () => {
    store.getFileRow.mockResolvedValue({ id: upload, uploaderId: "author", artifactId: "a1" });
    store.deleteFileRows.mockResolvedValue([{ id: upload, key: `files/${upload}/a.pdf` }]);
    access.canEditRecord.mockReturnValue(true);
    await deleteOwnFile("author", upload, "person");
    expect(versions.recordArtifactChange).toHaveBeenCalledWith(expect.objectContaining({ harness: null }));
  });

  it("should not look the harness up when an unattached upload is deleted", async () => {
    store.getFileRow.mockResolvedValue({ id: upload, uploaderId: "author", artifactId: null });
    store.removeUnattachedUpload.mockResolvedValue(true);
    const harness = vi.fn(() => Promise.resolve(null));
    await deleteOwnFile("author", upload, "agent", harness);
    expect(harness).not.toHaveBeenCalled();
  });
});
