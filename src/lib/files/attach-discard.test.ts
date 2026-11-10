import { beforeEach, describe, expect, it, vi } from "vitest";

import { actionErrorMessage } from "@/lib/action-errors";

import { unusableFilesForPeople } from "./person-messages";

/*
 * What the blank page relies on from the file rules: a discard never takes
 * a file out of an artifact, and the web app never shows the agents' wording
 * (ids, MCP tool names) when a file cannot be used. The file rows are mocked
 * at the store boundary.
 */

const store = vi.hoisted(() => ({ getFileRows: vi.fn(), countArtifactFiles: vi.fn(), attachFileRows: vi.fn(), clearIconForFile: vi.fn(), getFileRow: vi.fn(), removeFiles: vi.fn() }));
vi.mock("./store", () => store);
vi.mock("./icon-cleanup", () => ({ countHistoryOnlyImages: vi.fn() }));
vi.mock("@/lib/access", () => ({ canEditRecord: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/versions/service", () => ({ recordArtifactChange: vi.fn() }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

const { assertUsableFiles, discardUnattachedUpload } = await import("./attach");

const upload = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("discardUnattachedUpload", () => {
  it("should delete the uploader's own file when it is in no artifact", async () => {
    store.getFileRow.mockResolvedValue({ id: upload, uploaderId: "author", artifactId: null });
    await discardUnattachedUpload("author", upload);
    expect(store.removeFiles).toHaveBeenCalledWith([expect.objectContaining({ id: upload })]);
  });

  it("should leave a file alone when it is already in an artifact, as after a lost answer", async () => {
    store.getFileRow.mockResolvedValue({ id: upload, uploaderId: "author", artifactId: "artifact-1" });
    await discardUnattachedUpload("author", upload);
    expect(store.removeFiles).not.toHaveBeenCalled();
  });

  it("should leave someone else's upload alone", async () => {
    store.getFileRow.mockResolvedValue({ id: upload, uploaderId: "someone-else", artifactId: null });
    await discardUnattachedUpload("author", upload);
    expect(store.removeFiles).not.toHaveBeenCalled();
  });

  it("should do nothing when the file is gone", async () => {
    store.getFileRow.mockResolvedValue(null);
    await discardUnattachedUpload("author", upload);
    expect(store.removeFiles).not.toHaveBeenCalled();
  });
});

describe("assertUsableFiles wording", () => {
  it("should name the ids and the upload tools for agents, and show the web app plain copy, when a file is unknown", async () => {
    store.getFileRows.mockResolvedValue([]);
    const error = await assertUsableFiles("author", null, [upload]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("files_request_upload");
    const shown = actionErrorMessage(error, "fallback");
    expect(shown).toBe(unusableFilesForPeople);
    expect(shown).not.toMatch(/files_|[0-9a-f]{8}-/);
  });
});
