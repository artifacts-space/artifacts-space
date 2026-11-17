import { describe, expect, it } from "vitest";

import { findAnchoredBlock, parseBlockHash } from "./anchor-rules";
import { imageBlockHash, imagePlaceWords, imageViewHash, imageViewTarget, stepImage } from "./image-view-rules";

const fileId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("imageViewHash", () => {
  it("should name the open image when the fragment is the one an open image sets", () => {
    expect(imageViewHash(fileId.toUpperCase())).toBe(`#block-file=${fileId}&view=1`);
    expect(imageViewTarget(imageViewHash(fileId))).toBe(fileId);
  });

  it("should still land on the image's block when a surface reads it as a block link", () => {
    const anchor = parseBlockHash(imageViewHash(fileId));
    expect(anchor).toEqual({ kind: "file", fileId });
    expect(anchor ? findAnchoredBlock([{ text: "", fileIds: [fileId], topIndex: 0 }], anchor) : -1).toBe(0);
  });
});

describe("imageViewTarget", () => {
  it.each([
    ["", "an empty fragment"],
    [imageBlockHash(fileId), "the block link alone"],
    [`#block-file=${fileId}&view=0`, "a view that is off"],
    ["#block-file=not-a-file&view=1", "a file id that is not one"],
    ["#block=Some%20words&view=1", "a link to a block of words"],
    ["#block-at=3&view=1", "a link to a place"],
    ["#view=1", "the view field alone"],
  ])("should name no open image for %s (%s)", (hash) => {
    expect(imageViewTarget(hash)).toBeNull();
  });

  it("should ignore a text directive after the fragment", () => {
    expect(imageViewTarget(`${imageViewHash(fileId)}:~:text=words`)).toBe(fileId);
  });
});

describe("stepImage", () => {
  it("should move one image and stop at either end", () => {
    expect(stepImage(1, 3, 1)).toBe(2);
    expect(stepImage(2, 3, 1)).toBe(2);
    expect(stepImage(0, 3, -1)).toBe(0);
    expect(stepImage(0, 0, 1)).toBe(0);
  });
});

describe("imagePlaceWords", () => {
  it("should count from one", () => {
    expect(imagePlaceWords(1, 5)).toBe("2 of 5");
  });
});
