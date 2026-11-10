import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifactVersion } from "@/db/schema";

import { createTableQueueDb } from "./table-queue-db";

/*
 * Which kept icon and cover images a reader of the approved version may not
 * open, against queued database results.
 */

const state = vi.hoisted((): { db: unknown } => ({ db: null }));

vi.mock("@/db", () => ({ getDb: () => state.db }));

const { contentFilesQuery, hiddenImagesFor } = await import("./served-images");

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

/** Queues the version queries' rows, and the ids the content-files query finds. */
function stage(versionResults: unknown[], contentFiles: string[] = []) {
  state.db = createTableQueueDb(new Map([[artifactVersion, versionResults]]), [{ rows: contentFiles.map((id) => ({ id })) }]);
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

describe("contentFilesQuery", () => {
  it("should qualify every column so the subqueries compare the file with its own artifact's versions", () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(contentFilesQuery("a1"));
    const compact = text.replace(/\s+/g, " ");
    expect(params).toEqual(["a1", "ui", "markdown"]);
    expect(compact).toContain('from "artifact_file" f where f.artifact_id = $1');
    expect(compact).toContain("v.artifact_id = f.artifact_id");
    expect(compact).toContain("strpos(v.content, f.id) > 0");
    expect(compact).not.toMatch(/[^.]\b(artifact_id|content) = /);
  });
});
