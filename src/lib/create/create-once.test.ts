import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as CreatedByRequest from "./created-by-request";

/*
 * The blank page's create, with the store, file checks, and rate limit
 * mocked at their boundaries: once per create id, retries counted, files
 * attached only by the create that stored the artifact.
 */

const mocks = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  assertUsableFiles: vi.fn(),
  attachFiles: vi.fn(),
  createdByRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/artifacts", () => ({ createArtifact: mocks.createArtifact }));
vi.mock("@/lib/files/attach", () => ({ assertUsableFiles: mocks.assertUsableFiles, attachFiles: mocks.attachFiles }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("./created-by-request", async (importOriginal) => ({ ...(await importOriginal<typeof CreatedByRequest>()), artifactCreatedByRequest: mocks.createdByRequest }));

const { CreateRequestTaken } = await import("./created-by-request");
const { createArtifactOnce } = await import("./create-once");

const input = { title: "Plan", content: "", kind: "markdown" as const };
const requestId = "0b6f6d43-8a8f-4b52-9f44-2f8c1a6d3e10";
const fileId = "3f1c2b8e-6a1d-4e2f-9b7c-1d2e3f4a5b6c";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createArtifact.mockResolvedValue({ id: "artifact-1" });
  mocks.createdByRequest.mockResolvedValue(null);
});

describe("createArtifactOnce", () => {
  it("should create with an empty Markdown body allowed and the create id stored", async () => {
    await expect(createArtifactOnce("user-1", input, [], requestId)).resolves.toEqual({ id: "artifact-1", created: true });
    expect(mocks.createArtifact).toHaveBeenCalledWith("user-1", { ...input, source: "web" }, { emptyMarkdown: true, createRequestId: requestId });
  });

  it("should hand back the stored artifact, and count the retry against the create limit, when the create id was stored before", async () => {
    mocks.createdByRequest.mockResolvedValue("artifact-1");
    await expect(createArtifactOnce("user-1", input, [fileId], requestId)).resolves.toEqual({ id: "artifact-1", created: false });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("artifactCreate", "user-1");
    expect(mocks.createArtifact).not.toHaveBeenCalled();
    expect(mocks.attachFiles).not.toHaveBeenCalled();
  });

  it("should hand back the winner and attach nothing when a racing create stored the same create id first", async () => {
    mocks.createArtifact.mockRejectedValue(new CreateRequestTaken());
    mocks.createdByRequest.mockResolvedValueOnce(null).mockResolvedValueOnce("artifact-9");
    await expect(createArtifactOnce("user-1", input, [fileId], requestId)).resolves.toEqual({ id: "artifact-9", created: false });
    expect(mocks.attachFiles).not.toHaveBeenCalled();
  });

  it("should check and attach dropped files when it stores the artifact", async () => {
    await createArtifactOnce("user-1", { ...input, kind: "file" }, [fileId], requestId);
    expect(mocks.assertUsableFiles).toHaveBeenCalledWith("user-1", null, [fileId]);
    expect(mocks.attachFiles).toHaveBeenCalledWith("user-1", "artifact-1", [fileId], "person");
  });

  it("should not look anything up, or store a create id, when no create id is sent", async () => {
    await createArtifactOnce("user-1", input, [], null);
    expect(mocks.createdByRequest).not.toHaveBeenCalled();
    expect(mocks.createArtifact).toHaveBeenCalledWith("user-1", expect.anything(), { emptyMarkdown: true });
  });

  it("should pass on any other failure", async () => {
    mocks.createArtifact.mockRejectedValue(new Error("down"));
    await expect(createArtifactOnce("user-1", input, [], requestId)).rejects.toThrow("down");
  });
});
