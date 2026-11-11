import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The blank page's create action: it checks the session and its input with
 * zod before anything else, then hands the create to createArtifactOnce.
 * The session, the store, and the create are mocked at their boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  createOnce: vi.fn(),
  getEditableArtifact: vi.fn(),
  toArtifactDtos: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/artifacts", () => ({ toArtifactDtos: mocks.toArtifactDtos }));
vi.mock("@/lib/create/create-once", () => ({ createArtifactOnce: mocks.createOnce }));
vi.mock("@/lib/files/attach", () => ({ attachFiles: vi.fn(), deleteOwnFile: vi.fn(), discardUnattachedUpload: vi.fn() }));
vi.mock("@/lib/files/uploads", () => ({ finalizeUpload: vi.fn(), requestUpload: vi.fn() }));

const { createArtifactWithFilesAction } = await import("./file-actions");

const input = { title: "Plan", content: "", kind: "markdown" as const };
const requestId = "0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.createOnce.mockResolvedValue({ id: "artifact-1", created: true });
  mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1" });
  mocks.toArtifactDtos.mockResolvedValue([{ id: "artifact-1", title: "Plan" }]);
});

describe("createArtifactWithFilesAction", () => {
  it("should create nothing when the person is signed out", async () => {
    mocks.session.mockResolvedValue(null);
    const result = await createArtifactWithFilesAction(input, [], requestId);
    expect(result).toEqual({ success: false, error: "Your session ended. Sign in again." });
    expect(mocks.createOnce).not.toHaveBeenCalled();
  });

  it("should hand the create, its files, and its create id to createArtifactOnce", async () => {
    const result = await createArtifactWithFilesAction(input, [], requestId);
    expect(result).toMatchObject({ success: true, data: { id: "artifact-1" } });
    expect(mocks.createOnce).toHaveBeenCalledWith("user-1", input, [], requestId);
  });

  it("should refuse a create id that is not an id before creating anything", async () => {
    const result = await createArtifactWithFilesAction(input, [], "web:not-an-id");
    expect(result.success).toBe(false);
    expect(mocks.createOnce).not.toHaveBeenCalled();
  });

  it("should refuse file ids that are not ids before creating anything", async () => {
    const result = await createArtifactWithFilesAction(input, ["not-an-id"], requestId);
    expect(result.success).toBe(false);
    expect(mocks.createOnce).not.toHaveBeenCalled();
  });

  it("should create without a create id when none is sent", async () => {
    await createArtifactWithFilesAction(input, []);
    expect(mocks.createOnce).toHaveBeenCalledWith("user-1", input, [], null);
  });
});
