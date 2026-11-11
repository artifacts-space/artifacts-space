import { describe, expect, it, vi } from "vitest";

import { ArtifactContentError } from "@/lib/artifact-content";

/*
 * createArtifact checks the content before it touches the database, so an
 * agent's create (MCP never passes `emptyMarkdown`) with an empty Markdown
 * body is refused here. Only the web app's blank page opts in.
 */

vi.mock("@/db", () => ({ getDb: () => { throw new Error("The database must not be reached."); } }));

const { createArtifact } = await import("./artifacts");

describe("createArtifact", () => {
  it("should refuse an empty Markdown body before storing anything when the caller does not opt in, as every agent create does", async () => {
    for (const options of [undefined, { harness: null }]) {
      const error: unknown = await createArtifact("user-1", { title: "Plan", content: "", kind: "markdown" }, options).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ArtifactContentError);
    }
  });
});
