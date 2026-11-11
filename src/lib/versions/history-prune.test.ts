import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact, artifactVersion, sharingRequest } from "@/db/schema";
import { createTableQueueDb } from "@/lib/files/table-queue-db";

/*
 * History pruning takes the icon and cover images, and the removed media,
 * only the dropped versions showed with it. The image cleanup itself is tested in icon-cleanup.test.ts.
 */

const state = vi.hoisted((): { db: unknown } => ({ db: null }));
const cleanup = vi.hoisted(() => ({ pruneUnusedIconFilesQuietly: vi.fn(), pruneUnusedContentFilesQuietly: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/files/icon-cleanup", () => cleanup);

const { pruneAllVersions, pruneArtifactVersions } = await import("./history");

const now = new Date("2026-11-07T12:00:00Z");
const longAgo = new Date("2024-01-01T00:00:00Z");
const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";

function stageVersions(versions: Record<string, unknown>[]) {
  state.db = createTableQueueDb(
    new Map<unknown, unknown[]>([
      [artifact, [[{ approvedVersionId: null }]]],
      [sharingRequest, [[]]],
      [artifactVersion, [versions, []]],
    ]),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  cleanup.pruneUnusedIconFilesQuietly.mockResolvedValue(undefined);
  cleanup.pruneUnusedContentFilesQuietly.mockResolvedValue(undefined);
});

describe("pruneArtifactVersions", () => {
  it("should offer the dropped version's cover image to the cleanup when pruning drops it", async () => {
    stageVersions([
      { id: "v3", savedAt: now, icon: null, cover: null },
      { id: "v1", savedAt: longAgo, icon: "🚀", cover: `file:${fileId}@20` },
    ]);
    await expect(pruneArtifactVersions("a1", now)).resolves.toBe(1);
    expect(cleanup.pruneUnusedIconFilesQuietly).toHaveBeenCalledWith("a1", [`file:${fileId}@20`]);
  });

  it("should not run the image cleanup when the dropped versions showed no uploaded image", async () => {
    stageVersions([
      { id: "v3", savedAt: now, icon: null, cover: `file:${fileId}` },
      { id: "v1", savedAt: longAgo, icon: "tabler:rocket", cover: "mist" },
    ]);
    await expect(pruneArtifactVersions("a1", now)).resolves.toBe(1);
    expect(cleanup.pruneUnusedIconFilesQuietly).not.toHaveBeenCalled();
  });

  it("should check the artifact's removed media when pruning drops a version, since it may have been the last to embed them", async () => {
    stageVersions([
      { id: "v3", savedAt: now, icon: null, cover: null },
      { id: "v1", savedAt: longAgo, icon: null, cover: null },
    ]);
    await expect(pruneArtifactVersions("a1", now)).resolves.toBe(1);
    expect(cleanup.pruneUnusedContentFilesQuietly).toHaveBeenCalledWith("a1");
  });
});

describe("pruneAllVersions", () => {
  it("should offer each artifact's dropped images to the cleanup", async () => {
    state.db = createTableQueueDb(new Map(), [
      {
        rows: [
          { id: "v1", artifact_id: "a1", icon: `file:${fileId}`, cover: null },
          { id: "v2", artifact_id: "a1", icon: null, cover: "dusk" },
          { id: "v9", artifact_id: "a2", icon: null, cover: null },
        ],
      },
    ]);
    await expect(pruneAllVersions()).resolves.toEqual({ removed: 3, remaining: false });
    expect(cleanup.pruneUnusedIconFilesQuietly).toHaveBeenCalledTimes(1);
    expect(cleanup.pruneUnusedIconFilesQuietly).toHaveBeenCalledWith("a1", [`file:${fileId}`]);
    expect(cleanup.pruneUnusedContentFilesQuietly.mock.calls).toEqual([["a1"], ["a2"]]);
  });
});
