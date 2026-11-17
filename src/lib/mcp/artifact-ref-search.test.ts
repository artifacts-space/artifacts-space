import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";

const publicIdForRef = vi.hoisted(() => vi.fn());
const loadArtifactForViewer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/artifact-ref/resolve", () => ({ publicIdForRef }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer }));

import { LONG_QUERY_MESSAGE, referencedListItem, SEARCH_QUERY_MAX_CHARS, SEARCH_TEXT_MAX_CHARS, searchWithReferenced, withReferenced } from "./artifact-ref-search";

const origin = "https://artifacts.example";
const id = "4fXkP9qR2sT7vW1yZ3aB5c";
const uuid = "c4537d4c-1a2b-4c3d-8e9f-0123456789ab";

/** A loaded artifact as loadArtifactForViewer returns it; only the fields the search reads are real. */
function loaded(values: Partial<ArtifactDto>, canEdit: boolean) {
  const dto = { id: "internal", publicId: id, title: "Listing issues", kind: "markdown", content: "Body text.", allowCsvDownload: true, ...values } as ArtifactDto;
  return { dto, viewable: { canEdit } };
}

const item = (publicId: string): ArtifactListItemDto => ({ publicId, title: publicId, preview: "" }) as ArtifactListItemDto;

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  publicIdForRef.mockReset();
  loadArtifactForViewer.mockReset();
  publicIdForRef.mockImplementation((ref: { kind: string; publicId?: string }) => Promise.resolve(ref.kind === "publicId" ? ref.publicId : id));
});

describe("referencedListItem", () => {
  it.each([
    ["the id", id],
    ["the artifact's link", `${origin}/artifact/${id}`],
    ["the workspace link", `${origin}/app?artifact=${id}`],
    ["an internal id", uuid],
  ])("should return the artifact, with a preview and no content, when the query is %s and the caller can read it", async (_name, query) => {
    loadArtifactForViewer.mockResolvedValue(loaded({}, false));
    const found = await referencedListItem("user-1", query);
    expect(found).toMatchObject({ publicId: id, title: "Listing issues", preview: "Body text." });
    expect(found).not.toHaveProperty("content");
    expect(loadArtifactForViewer).toHaveBeenCalledWith(id, "user-1");
  });

  it("should return nothing when the caller cannot read the artifact the query names", async () => {
    loadArtifactForViewer.mockResolvedValue(null);
    expect(await referencedListItem("user-1", id)).toBeNull();
  });

  it("should return nothing, and load nothing, when an internal id names nothing the caller can read", async () => {
    publicIdForRef.mockResolvedValue(null);
    expect(await referencedListItem("user-1", uuid)).toBeNull();
    expect(loadArtifactForViewer).not.toHaveBeenCalled();
  });

  it.each([["words", "listing connection issues"], ["a link to another site", `https://other.example/artifact/${id}`], ["nothing", undefined]])(
    "should look nothing up when the query is %s",
    async (_name, query) => {
      expect(await referencedListItem("user-1", query)).toBeNull();
      expect(publicIdForRef).not.toHaveBeenCalled();
      expect(loadArtifactForViewer).not.toHaveBeenCalled();
    },
  );

  it("should give no preview of a CSV whose owner turned downloads off when the caller cannot edit it", async () => {
    loadArtifactForViewer.mockResolvedValue(loaded({ kind: "csv", content: "name,secret\na,b", allowCsvDownload: false }, false));
    expect(await referencedListItem("user-1", id)).toMatchObject({ publicId: id, preview: "" });
    loadArtifactForViewer.mockResolvedValue(loaded({ kind: "csv", content: "name,secret\na,b", allowCsvDownload: false }, true));
    expect(await referencedListItem("user-1", id)).toMatchObject({ preview: "name,secret\na,b" });
  });

  it("should let the text search answer alone when the lookup fails", async () => {
    loadArtifactForViewer.mockRejectedValue(new Error("database down"));
    expect(await referencedListItem("user-1", id)).toBeNull();
  });
});

describe("withReferenced", () => {
  it("should put the named artifact first, once, and keep the list within its limit", () => {
    const list = [item("a"), item(id), item("b")];
    expect(withReferenced(item(id), list, 25).map((entry) => entry.publicId)).toEqual([id, "a", "b"]);
    expect(withReferenced(item(id), [item("a"), item("b")], 2).map((entry) => entry.publicId)).toEqual([id, "a"]);
  });

  it("should leave the list as it is when the query names no artifact", () => {
    expect(withReferenced(null, [item("a"), item("b")], 25).map((entry) => entry.publicId)).toEqual(["a", "b"]);
  });
});

describe("searchWithReferenced", () => {
  const search = vi.fn();
  const input = (query: string | undefined, filtered = false) => ({ userId: "user-1", query, filtered, limit: 25, search });
  /** A link to one block: the artifact's link with the block's quoted words, longer than search text may be. */
  const blockLink = `${origin}/artifact/${id}#block=${"word%20".repeat(60)}:~:text=${"word%20".repeat(60)}`;

  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue([item("a"), item("b")]);
    loadArtifactForViewer.mockResolvedValue(loaded({}, false));
  });

  it("should search the text and put the artifact a short query names first", async () => {
    const found = await searchWithReferenced(input(`${origin}/artifact/${id}`));
    expect(found.map((entry) => entry.publicId)).toEqual([id, "a", "b"]);
    expect(search).toHaveBeenCalledWith(`${origin}/artifact/${id}`);
  });

  it("should leave the artifact a query names to the filters when a project or tags narrow the list", async () => {
    const found = await searchWithReferenced(input(id, true));
    expect(found.map((entry) => entry.publicId)).toEqual(["a", "b"]);
    expect(loadArtifactForViewer).not.toHaveBeenCalled();
  });

  it("should return the artifact alone, and search no text, when the query is a link longer than search text may be", async () => {
    expect(blockLink.length).toBeGreaterThan(SEARCH_TEXT_MAX_CHARS);
    expect(blockLink.length).toBeLessThanOrEqual(SEARCH_QUERY_MAX_CHARS);
    const found = await searchWithReferenced(input(blockLink));
    expect(found.map((entry) => entry.publicId)).toEqual([id]);
    expect(search).not.toHaveBeenCalled();
  });

  it("should return nothing for a long link to an artifact the caller cannot read", async () => {
    loadArtifactForViewer.mockResolvedValue(null);
    expect(await searchWithReferenced(input(blockLink))).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("should refuse text longer than search text may be, with what to do, and search nothing", async () => {
    await expect(searchWithReferenced(input("word ".repeat(80)))).rejects.toThrow(LONG_QUERY_MESSAGE);
    expect(LONG_QUERY_MESSAGE).toContain("artifacts_get");
    expect(search).not.toHaveBeenCalled();
    expect(loadArtifactForViewer).not.toHaveBeenCalled();
  });

  it("should search as before when there is no query", async () => {
    const found = await searchWithReferenced(input(undefined));
    expect(found.map((entry) => entry.publicId)).toEqual(["a", "b"]);
    expect(search).toHaveBeenCalledWith(undefined);
  });
});
