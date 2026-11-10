import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The blank page's create: it goes through the normal create (and so its
 * validation and rate limit), lets a Markdown artifact start with only a
 * title, and does nothing for someone signed out. The session, the store,
 * and the file checks are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  createArtifact: vi.fn(),
  assertUsableFiles: vi.fn(),
  attachFiles: vi.fn(),
  getEditableArtifact: vi.fn(),
  toArtifactDtos: vi.fn(),
  createdByRequest: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/artifacts", () => ({ createArtifact: mocks.createArtifact, toArtifactDtos: mocks.toArtifactDtos }));
vi.mock("@/lib/files/attach", () => ({ assertUsableFiles: mocks.assertUsableFiles, attachFiles: mocks.attachFiles, deleteOwnFile: vi.fn() }));
vi.mock("@/lib/create/created-by-request", () => ({ artifactCreatedByRequest: mocks.createdByRequest }));
vi.mock("@/lib/files/uploads", () => ({ finalizeUpload: vi.fn(), requestUpload: vi.fn() }));

const { createArtifactWithFilesAction } = await import("./file-actions");

const input = { title: "Plan", content: "", kind: "markdown" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.createArtifact.mockResolvedValue({ id: "artifact-1" });
  mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1" });
  mocks.toArtifactDtos.mockResolvedValue([{ id: "artifact-1", title: "Plan" }]);
  mocks.createdByRequest.mockResolvedValue(null);
});

describe("createArtifactWithFilesAction", () => {
  it("should create nothing when the person is signed out", async () => {
    mocks.session.mockResolvedValue(null);
    const result = await createArtifactWithFilesAction(input, []);
    expect(result).toEqual({ success: false, error: "Your session ended. Sign in again." });
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it("should let a markdown artifact start with only a title when the blank page creates it", async () => {
    const result = await createArtifactWithFilesAction(input, []);
    expect(result).toMatchObject({ success: true, data: { id: "artifact-1" } });
    expect(mocks.createArtifact).toHaveBeenCalledWith("user-1", { ...input, source: "web" }, { emptyMarkdown: true });
    expect(mocks.attachFiles).not.toHaveBeenCalled();
  });

  it("should check and attach dropped files when it creates a file artifact", async () => {
    const fileId = "3f1c2b8e-6a1d-4e2f-9b7c-1d2e3f4a5b6c";
    await createArtifactWithFilesAction({ title: "photo", content: "", kind: "file" }, [fileId]);
    expect(mocks.assertUsableFiles).toHaveBeenCalledWith("user-1", null, [fileId]);
    expect(mocks.attachFiles).toHaveBeenCalledWith("user-1", "artifact-1", [fileId], "person");
  });

  it("should refuse file ids that are not ids before creating anything", async () => {
    const result = await createArtifactWithFilesAction(input, ["not-an-id"]);
    expect(result.success).toBe(false);
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it("should hand back the artifact the first try stored when a retry carries the same create id", async () => {
    const sessionId = "web:0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";
    mocks.createdByRequest.mockResolvedValue("artifact-1");
    const result = await createArtifactWithFilesAction({ ...input, sessionId }, []);
    expect(result).toMatchObject({ success: true, data: { id: "artifact-1" } });
    expect(mocks.createdByRequest).toHaveBeenCalledWith("user-1", sessionId);
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it("should create when the create id finds nothing of this user's", async () => {
    const sessionId = "web:0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";
    await createArtifactWithFilesAction({ ...input, sessionId }, []);
    expect(mocks.createArtifact).toHaveBeenCalledTimes(1);
  });

  it("should not look anything up when the session id is not a blank page's create id", async () => {
    await createArtifactWithFilesAction({ ...input, sessionId: "agent-session-7" }, []);
    expect(mocks.createdByRequest).not.toHaveBeenCalled();
    expect(mocks.createArtifact).toHaveBeenCalledTimes(1);
  });
});
