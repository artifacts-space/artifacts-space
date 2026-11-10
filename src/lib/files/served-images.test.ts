import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifactFile, artifactVersion } from "@/db/schema";

import { createTableQueueDb } from "./table-queue-db";

/*
 * Which kept icon and cover images a reader of the approved version may not
 * open, against queued database results.
 */

const state = vi.hoisted((): { db: unknown } => ({ db: null }));

vi.mock("@/db", () => ({ getDb: () => state.db }));

const { fileHiddenFor, hiddenImagesFor } = await import("./served-images");

const oldCover = "0f8fad5b-d9cb-469f-a165-70867728950e";
const newCover = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const record = { id: "a1", kind: "markdown", icon: null, cover: `file:${newCover}` };
const servedAt = new Date("2026-11-07T12:00:00Z");

function approvedReader(served: { icon: string | null; cover: string | null }, kind = "markdown") {
  return {
    record: { ...record, kind },
    version: { source: "approved" as const, versionId: "v-approved" },
    served: { title: "Plan", theme: null, updatedAt: servedAt, editedBy: null, ...served },
  } as unknown as Parameters<typeof hiddenImagesFor>[0];
}

/** Queues the version queries' rows, and the files marked as named in content. */
function stage(versionResults: unknown[], contentFiles: string[] = []) {
  state.db = createTableQueueDb(new Map<unknown, unknown[]>([[artifactVersion, versionResults], [artifactFile, [contentFiles.map((id) => ({ id }))]]]));
}

beforeEach(() => {
  state.db = null;
});

describe("hiddenImagesFor", () => {
  it("should hide a cover image only an older version showed when the approved version shows no cover", async () => {
    stage([[{ icon: null, cover: `file:${oldCover}@30` }], [{ kind: "markdown", content: "# Plan" }]]);
    const hidden = await hiddenImagesFor(approvedReader({ icon: null, cover: null }));
    expect([...hidden].sort()).toEqual([oldCover, newCover].sort());
  });

  it("should hide the newer cover waiting for approval but not the approved one", async () => {
    stage([[{ icon: null, cover: `file:${oldCover}` }], [{ kind: "markdown", content: "# Plan" }]]);
    const hidden = await hiddenImagesFor(approvedReader({ icon: null, cover: `file:${oldCover}` }));
    expect([...hidden]).toEqual([newCover]);
  });

  it("should hide nothing when every image ever shown is the approved version's", async () => {
    stage([[{ icon: null, cover: `file:${newCover}` }]]);
    expect((await hiddenImagesFor(approvedReader({ icon: null, cover: `file:${newCover}@10` }))).size).toBe(0);
  });

  it("should not hide an image the approved ui content shows from an Image element", async () => {
    const content = JSON.stringify({ root: "page", elements: { page: { type: "Image", props: { file: oldCover } } } });
    stage([[{ icon: null, cover: `file:${oldCover}` }], [{ kind: "ui", content }]]);
    const hidden = await hiddenImagesFor(approvedReader({ icon: null, cover: `file:${newCover}` }, "ui"));
    expect([...hidden]).toEqual([]);
  });

  it("should hide a Markdown image another version embeds when the approved version does not show it", async () => {
    const inline = "9b2a4f43-6a7b-4a2e-8f61-3c1a9d2e7b10";
    stage([[{ icon: null, cover: `file:${newCover}` }], [{ kind: "markdown", content: "# Plan, no images yet" }]], [inline]);
    const hidden = await hiddenImagesFor(approvedReader({ icon: null, cover: `file:${newCover}` }));
    expect([...hidden]).toEqual([inline]);
  });

  it("should not hide a Markdown image the approved version embeds", async () => {
    const inline = "9b2a4f43-6a7b-4a2e-8f61-3c1a9d2e7b10";
    stage([[{ icon: null, cover: `file:${newCover}` }], [{ kind: "markdown", content: `![Chart](/api/files/${inline}#width=50)` }]], [inline]);
    expect((await hiddenImagesFor(approvedReader({ icon: null, cover: `file:${newCover}` }))).size).toBe(0);
  });

  it("should hide nothing and read nothing for the author and team, who read the latest version", async () => {
    const latest = { ...approvedReader({ icon: null, cover: null }), version: { source: "latest" as const, versionId: null } };
    await expect(hiddenImagesFor(latest)).resolves.toEqual(new Set());
  });
});

describe("fileHiddenFor", () => {
  const inline = "9b2a4f43-6a7b-4a2e-8f61-3c1a9d2e7b10";
  const embedded = { id: inline, namedInContent: true };

  it("should hide a file the content once named, with no version left naming it, when the approved version does not show it", async () => {
    // No versions are read but the approved one: the flag outlives pruned history.
    stage([[{ kind: "markdown", content: "# Plan, chart removed" }]]);
    await expect(fileHiddenFor(approvedReader({ icon: null, cover: `file:${newCover}` }), embedded)).resolves.toBe(true);
  });

  it("should not hide a file the approved version embeds", async () => {
    stage([[{ kind: "markdown", content: `![Chart](/api/files/${inline}#width=50)` }]]);
    await expect(fileHiddenFor(approvedReader({ icon: null, cover: `file:${newCover}` }), embedded)).resolves.toBe(false);
  });

  it("should not hide a plain attachment no version showed as an icon or cover or named", async () => {
    stage([[]]);
    await expect(fileHiddenFor(approvedReader({ icon: null, cover: `file:${newCover}` }), { id: inline, namedInContent: false })).resolves.toBe(false);
  });

  it("should hide an old cover the approved version does not show", async () => {
    stage([[{ id: "v-old" }], [{ kind: "markdown", content: "# Plan" }]]);
    await expect(fileHiddenFor(approvedReader({ icon: null, cover: null }), { id: oldCover, namedInContent: false })).resolves.toBe(true);
  });

  it("should not hide the approved version's own cover, and read nothing for it", async () => {
    state.db = createTableQueueDb(new Map());
    await expect(fileHiddenFor(approvedReader({ icon: null, cover: `file:${oldCover}@20` }), { id: oldCover, namedInContent: true })).resolves.toBe(false);
  });

  it("should hide nothing and read nothing for readers of the latest version", async () => {
    state.db = createTableQueueDb(new Map());
    const latest = { ...approvedReader({ icon: null, cover: null }), version: { source: "latest" as const, versionId: null } };
    await expect(fileHiddenFor(latest, embedded)).resolves.toBe(false);
  });
});
