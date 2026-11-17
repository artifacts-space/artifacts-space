import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The web app's page file actions: each checks the session, then its input
 * with zod, then edit access, before it hands the work to the batch tools'
 * services. The session, the access check, and the services are mocked at
 * their boundaries.
 */

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getEditableArtifact: vi.fn(),
  toArtifactDtos: vi.fn(),
  requestPageUploads: vi.fn(),
  publishPageFiles: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/artifacts", () => ({ toArtifactDtos: mocks.toArtifactDtos }));
vi.mock("@/lib/page-files/request-uploads", () => ({ requestPageUploads: mocks.requestPageUploads }));
vi.mock("@/lib/page-files/publish", () => ({ publishPageFiles: mocks.publishPageFiles }));

const { publishPageFilesAction, requestPageUploadsAction } = await import("./page-file-actions");

const uploadId = "0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";
const record = { id: "artifact-1", kind: "html" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getEditableArtifact.mockResolvedValue(record);
  mocks.toArtifactDtos.mockResolvedValue([{ id: "artifact-1", files: [] }]);
  mocks.requestPageUploads.mockResolvedValue([{ path: "css/site.css", fileId: uploadId, size: 10, contentType: "text/css", upload: { url: "https://store.example.com/put", headers: { "Content-Type": "text/css" }, expiresAt: new Date() } }]);
  mocks.publishPageFiles.mockResolvedValue({ savedAt: new Date(), versionId: "v1", status: "applied", added: ["css/site.css"], replaced: [], removed: [] });
});

describe("requestPageUploadsAction", () => {
  const input = { artifactId: "artifact-1", files: [{ path: "css/site.css", size: 10 }] };

  it("should start nothing when the person is signed out", async () => {
    mocks.session.mockResolvedValue(null);
    const result = await requestPageUploadsAction(input);
    expect(result).toEqual({ success: false, error: "Your session ended. Sign in again." });
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
    expect(mocks.requestPageUploads).not.toHaveBeenCalled();
  });

  it("should start nothing for an artifact the person may not edit", async () => {
    mocks.getEditableArtifact.mockResolvedValue(null);
    const result = await requestPageUploadsAction(input);
    expect(result).toEqual({ success: false, error: "Artifact not found." });
    expect(mocks.requestPageUploads).not.toHaveBeenCalled();
  });

  it("should ask the access check as this person, for this artifact", async () => {
    await requestPageUploadsAction(input);
    expect(mocks.getEditableArtifact).toHaveBeenCalledWith("user-1", { id: "artifact-1" });
  });

  it("should refuse more files than one request may start, before any check", async () => {
    const files = Array.from({ length: 51 }, (_, index) => ({ path: `f${String(index)}.css`, size: 1 }));
    const result = await requestPageUploadsAction({ artifactId: "artifact-1", files });
    expect(result.success).toBe(false);
    expect(mocks.getEditableArtifact).not.toHaveBeenCalled();
  });

  it("should refuse an empty size or path before any check", async () => {
    expect((await requestPageUploadsAction({ artifactId: "artifact-1", files: [{ path: "a.css", size: 0 }] })).success).toBe(false);
    expect((await requestPageUploadsAction({ artifactId: "artifact-1", files: [{ path: "", size: 1 }] })).success).toBe(false);
    expect(mocks.requestPageUploads).not.toHaveBeenCalled();
  });

  it("should hand every file to the service, which counts the hourly limit once per file, and return only what the browser needs", async () => {
    const result = await requestPageUploadsAction(input);
    expect(mocks.requestPageUploads).toHaveBeenCalledWith("user-1", { artifact: record, files: input.files, remove: [] });
    expect(result).toEqual({ success: true, data: [{ path: "css/site.css", fileId: uploadId, url: "https://store.example.com/put", headers: { "Content-Type": "text/css" } }] });
  });
});

describe("publishPageFilesAction", () => {
  const input = { artifactId: "artifact-1", uploadIds: [uploadId], remove: [] };

  it("should publish nothing when the person is signed out", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await publishPageFilesAction(input)).success).toBe(false);
    expect(mocks.publishPageFiles).not.toHaveBeenCalled();
  });

  it("should publish nothing to an artifact the person may not edit", async () => {
    mocks.getEditableArtifact.mockResolvedValue(null);
    expect(await publishPageFilesAction(input)).toEqual({ success: false, error: "Artifact not found." });
    expect(mocks.publishPageFiles).not.toHaveBeenCalled();
  });

  it("should refuse upload ids that are not ids, and a publish that names nothing", async () => {
    expect((await publishPageFilesAction({ ...input, uploadIds: ["not-an-id"] })).success).toBe(false);
    expect((await publishPageFilesAction({ ...input, uploadIds: [] })).success).toBe(false);
    expect(mocks.publishPageFiles).not.toHaveBeenCalled();
  });

  it("should publish as a person, by the artifact's internal id, and say what it did", async () => {
    const result = await publishPageFilesAction({ ...input, remove: ["js/old.js"] });
    expect(mocks.publishPageFiles).toHaveBeenCalledWith("user-1", { artifactId: "artifact-1", uploadIds: [uploadId], remove: ["js/old.js"] }, "person");
    expect(result).toEqual({ success: true, data: { artifact: { id: "artifact-1", files: [] }, status: "applied", added: ["css/site.css"], replaced: [], removed: [] } });
  });

  it("should pass on the service's refusal in its own words", async () => {
    const { UserFacingError } = await import("@/lib/user-facing-error");
    mocks.publishPageFiles.mockRejectedValue(new UserFacingError("Nothing was published. Fix these, then publish again:\n- a.css: bad"));
    expect(await publishPageFilesAction(input)).toEqual({ success: false, error: "Nothing was published. Fix these, then publish again:\n- a.css: bad" });
  });
});
