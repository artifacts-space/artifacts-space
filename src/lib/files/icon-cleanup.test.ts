import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact, artifactVersion } from "@/db/schema";

import { createTableQueueDb } from "./table-queue-db";

/*
 * Deleting icon and cover images nobody keeps, against queued database
 * results. R2 and the file rows are mocked at the store boundary.
 */

const state = vi.hoisted((): { db: unknown } => ({ db: null }));
const store = vi.hoisted(() => ({ getFileRows: vi.fn(), removeFiles: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("./store", () => store);

const { pruneUnusedIconFiles } = await import("./icon-cleanup");

const cover = "0f8fad5b-d9cb-469f-a165-70867728950e";
const other = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const record = { icon: null, cover: null, kind: "markdown", content: "# Plan" };

function stage(tables: [unknown, unknown[]][]) {
  state.db = createTableQueueDb(new Map(tables));
}

beforeEach(() => {
  vi.resetAllMocks();
  store.getFileRows.mockImplementation((ids: string[]) => Promise.resolve(ids.map((id) => ({ id, artifactId: "a1", key: `files/${id}/cover.jpg` }))));
  store.removeFiles.mockImplementation((rows: { id: string }[]) => Promise.resolve(rows.map((row) => row.id)));
});

describe("pruneUnusedIconFiles", () => {
  it("should keep a removed cover image when an older version still shows it, so Restore brings it back", async () => {
    stage([[artifact, [[record]]], [artifactVersion, [[{ icon: null, cover: `file:${cover}@20` }]]]]);
    await expect(pruneUnusedIconFiles("a1", [null, `file:${cover}@20`])).resolves.toBe(0);
    expect(store.removeFiles).not.toHaveBeenCalled();
  });

  it("should delete the image when the last version that showed it is gone", async () => {
    stage([[artifact, [[{ ...record, cover: "mist" }]]], [artifactVersion, [[{ icon: `file:${other}`, cover: null }]]]]);
    await expect(pruneUnusedIconFiles("a1", [`file:${cover}`])).resolves.toBe(1);
    expect(store.removeFiles).toHaveBeenCalledWith([{ id: cover, artifactId: "a1", key: `files/${cover}/cover.jpg` }]);
  });

  it("should never delete a file attached to another artifact", async () => {
    stage([[artifact, [[record]]], [artifactVersion, [[]]]]);
    store.getFileRows.mockResolvedValue([{ id: cover, artifactId: "a2", key: "files/x" }]);
    await expect(pruneUnusedIconFiles("a1", [`file:${cover}`])).resolves.toBe(0);
    expect(store.removeFiles).toHaveBeenCalledWith([]);
  });

  it("should keep an image a ui version still names in its content", async () => {
    stage([[artifact, [[{ ...record, kind: "ui", content: "{}" }]]], [artifactVersion, [[], [{ id: "v1" }]]]]);
    await expect(pruneUnusedIconFiles("a1", [`file:${cover}`])).resolves.toBe(0);
    expect(store.getFileRows).not.toHaveBeenCalled();
  });

  it("should read nothing when no candidate is an uploaded image", async () => {
    stage([]);
    await expect(pruneUnusedIconFiles("a1", ["mist", "🚀", null])).resolves.toBe(0);
  });
});
