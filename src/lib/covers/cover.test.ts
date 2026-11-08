import { describe, expect, it } from "vitest";

import { artifactInputSchema, artifactUpdateSchema } from "@/lib/artifacts";

import { artifactCoverInputSchema, coverFileId, coverLabel, mcpCoverFields, normalizeCoverInput, parseArtifactCover, resolveCoverChange, withCoverPosition } from "./cover";

const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("parseArtifactCover", () => {
  it("should read a gradient id and an uploaded image with its focal point", () => {
    expect(parseArtifactCover("mist")).toMatchObject({ type: "gradient", gradient: { id: "mist" } });
    expect(parseArtifactCover(`file:${fileId}`)).toEqual({ type: "image", fileId, position: 50 });
    expect(parseArtifactCover(`file:${fileId.toUpperCase()}@0`)).toEqual({ type: "image", fileId, position: 0 });
    expect(parseArtifactCover(`file:${fileId}@100`)).toEqual({ type: "image", fileId, position: 100 });
  });

  it("should refuse anything that is not a known gradient or an uploaded file when it is sent", () => {
    for (const value of ["neon", "https://example.com/cover.png", "url(https://example.com/a.png)", "file:not-a-uuid", `file:${fileId}@101`, `file:${fileId}@-1`, `file:${fileId}@4.5`, `file:${fileId}@1@2`, "linear-gradient(red, blue)"]) {
      expect(parseArtifactCover(value)).toBeNull();
    }
  });
});

describe("normalizeCoverInput", () => {
  it("should remove the cover when the input is null, empty, or only spaces", () => {
    expect(normalizeCoverInput(null)).toBeNull();
    expect(normalizeCoverInput("")).toBeNull();
    expect(normalizeCoverInput("   ")).toBeNull();
  });

  it("should store the centre focal point as the plain file reference", () => {
    expect(normalizeCoverInput(` file:${fileId}@50 `)).toBe(`file:${fileId}`);
    expect(normalizeCoverInput(`file:${fileId}@07`)).toBe(`file:${fileId}@7`);
  });

  it("should give undefined when the input is not a cover", () => {
    expect(normalizeCoverInput("https://example.com/a.jpg")).toBeUndefined();
  });
});

describe("artifactCoverInputSchema", () => {
  it("should refuse a remote URL with a message that names the allowed values", () => {
    const result = artifactCoverInputSchema.safeParse("https://example.com/cover.jpg");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/gradient id .*mist.*file:<file id>.*Remote URLs are not accepted/);
  });

  it("should be part of artifact create and update when a cover is sent", () => {
    expect(artifactUpdateSchema.parse({ cover: "dusk" }).cover).toBe("dusk");
    expect(artifactUpdateSchema.parse({ cover: "" }).cover).toBeNull();
    expect("cover" in artifactUpdateSchema.parse({ title: "New" })).toBe(false);
    expect(artifactInputSchema.safeParse({ title: "T", content: "c", cover: "rainbow" }).success).toBe(false);
  });
});

describe("cover helpers", () => {
  it("should find the file only for image covers", () => {
    expect(coverFileId(`file:${fileId}@30`)).toBe(fileId);
    expect(coverFileId("mist")).toBeNull();
    expect(coverFileId(null)).toBeNull();
  });

  it("should move only an image cover's focal point when a new position is set", () => {
    expect(withCoverPosition(`file:${fileId}`, 25)).toBe(`file:${fileId}@25`);
    expect(withCoverPosition(`file:${fileId}@25`, 50)).toBe(`file:${fileId}`);
    expect(withCoverPosition("mist", 25)).toBe("mist");
  });

  it("should label covers in plain words and never show a file reference", () => {
    expect(coverLabel("mist")).toBe("Mist");
    expect(coverLabel(`file:${fileId}`)).toBe("Image");
    expect(coverLabel(`file:${fileId}@20`)).toBe("Image (focus 20%)");
    expect(coverLabel(null)).toBe("No cover");
  });

  it("should split an image cover into the value and its position for agents", () => {
    expect(mcpCoverFields(`file:${fileId}@20`)).toEqual({ cover: `file:${fileId}`, coverPosition: 20 });
    expect(mcpCoverFields("mist")).toEqual({ cover: "mist", coverPosition: null });
    expect(mcpCoverFields(null)).toEqual({ cover: null, coverPosition: null });
  });
});

describe("resolveCoverChange", () => {
  it("should keep the cover when the agent sends neither field", () => {
    expect(resolveCoverChange(undefined, undefined, "mist")).toEqual({ ok: true, cover: undefined });
  });

  it("should combine an image and a position sent together", () => {
    expect(resolveCoverChange(`file:${fileId}`, 10, null)).toEqual({ ok: true, cover: `file:${fileId}@10` });
  });

  it("should move the current image cover when only a position is sent", () => {
    expect(resolveCoverChange(undefined, 80, `file:${fileId}@20`)).toEqual({ ok: true, cover: `file:${fileId}@80` });
  });

  it("should refuse a position when there is no image cover to move", () => {
    for (const [cover, current] of [[undefined, "mist"], [undefined, null], [null, `file:${fileId}`], ["dawn", null]] as const) {
      const result = resolveCoverChange(cover, 40, current);
      expect(result.ok).toBe(false);
    }
  });

  it("should refuse an invalid cover with the rule message", () => {
    const result = resolveCoverChange("https://example.com/a.png", undefined, null);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/Remote URLs are not accepted/) as unknown });
  });
});
