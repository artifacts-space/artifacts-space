import { describe, expect, it } from "vitest";

import { dropsShownImage, hiddenImageFiles, imageFileIdOf, imageFileIdsOf, unusedIconFiles, type IconUseState } from "./icon-cleanup-rules";

const oldFile = "0f8fad5b-d9cb-469f-a165-70867728950e";
const newFile = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const markdown: IconUseState = { icon: "🚀", cover: null, kind: "markdown", content: "# Plan" };
const uiUsing = (fileId: string): IconUseState => ({
  icon: null,
  cover: null,
  kind: "ui",
  content: JSON.stringify({ version: 1, root: "page", elements: { page: { type: "Image", props: { file: fileId, alt: "Logo" } } } }),
});

describe("unusedIconFiles", () => {
  it("should delete the old image when nothing shows it now and no version in the history shows it", () => {
    expect(unusedIconFiles([oldFile], markdown, [])).toEqual([oldFile]);
    expect(unusedIconFiles([oldFile], { ...markdown, icon: null }, [{ icon: "🚀", cover: "mist" }])).toEqual([oldFile]);
  });

  it("should keep a removed cover image while an older version in the history shows it, so Restore brings it back", () => {
    expect(unusedIconFiles([oldFile], { ...markdown, cover: null }, [{ icon: null, cover: null }, { icon: null, cover: `file:${oldFile}@20` }])).toEqual([]);
  });

  it("should keep a replaced icon image while any version shows it", () => {
    expect(unusedIconFiles([oldFile], { ...markdown, icon: `file:${newFile}` }, [{ icon: `file:${oldFile}`, cover: null }])).toEqual([]);
  });

  it("should delete the image once history pruning dropped the last version that showed it", () => {
    const remaining = [{ icon: null, cover: "mist" }, { icon: `file:${newFile}`, cover: null }];
    expect(unusedIconFiles([oldFile, newFile], { ...markdown, cover: "mist" }, remaining)).toEqual([oldFile]);
  });

  it("should keep the image when the content still points at it from an Image element", () => {
    expect(unusedIconFiles([oldFile], uiUsing(oldFile), [])).toEqual([]);
  });

  it("should keep the image that is the cover now, with or without a focal point", () => {
    expect(unusedIconFiles([oldFile, newFile], { ...markdown, cover: `file:${newFile}@30` }, [])).toEqual([oldFile]);
    expect(unusedIconFiles([oldFile], { ...markdown, cover: `file:${oldFile}` }, [])).toEqual([]);
  });

  it("should keep everything in a file artifact, where every attachment is content", () => {
    expect(unusedIconFiles([oldFile], { ...markdown, kind: "file" }, [])).toEqual([]);
  });

  it("should list each unused file once when it was both the icon and the cover", () => {
    expect(unusedIconFiles([oldFile, oldFile], markdown, [])).toEqual([oldFile]);
  });
});

describe("hiddenImageFiles", () => {
  const served = { icon: null, cover: null, kind: "markdown", contentRefs: [] };

  it("should hide an old cover image when the approved version shows no cover", () => {
    expect([...hiddenImageFiles([oldFile], served)]).toEqual([oldFile]);
  });

  it("should hide a newer cover image the approved version does not show yet", () => {
    expect([...hiddenImageFiles([oldFile, newFile], { ...served, cover: `file:${oldFile}@40` })]).toEqual([newFile]);
  });

  it("should not hide the approved version's own icon or cover", () => {
    expect(hiddenImageFiles([oldFile, newFile], { ...served, icon: `file:${oldFile}`, cover: `file:${newFile}` }).size).toBe(0);
  });

  it("should not hide an image the approved content shows from an Image element", () => {
    expect(hiddenImageFiles([oldFile], { ...served, kind: "ui", contentRefs: [oldFile] }).size).toBe(0);
  });

  it("should hide nothing in a file artifact, where every attachment is content", () => {
    expect(hiddenImageFiles([oldFile], { ...served, kind: "file" }).size).toBe(0);
  });
});

describe("imageFileIdOf", () => {
  it("should find the file behind an icon or a cover value", () => {
    expect(imageFileIdOf(`file:${oldFile}`)).toBe(oldFile);
    expect(imageFileIdOf(`file:${oldFile}@75`)).toBe(oldFile);
    expect(imageFileIdOf("mist")).toBeNull();
    expect(imageFileIdOf("🚀")).toBeNull();
  });

  it("should list the images an icon and cover pair shows", () => {
    expect(imageFileIdsOf({ icon: `file:${oldFile}`, cover: `file:${newFile}@10` })).toEqual([oldFile, newFile]);
    expect(imageFileIdsOf({ icon: "tabler:rocket", cover: "dusk" })).toEqual([]);
  });
});

describe("dropsShownImage", () => {
  it("should be true when a save removes or replaces an uploaded cover or icon", () => {
    expect(dropsShownImage({ icon: null, cover: `file:${oldFile}@30` }, { icon: null, cover: null })).toBe(true);
    expect(dropsShownImage({ icon: null, cover: `file:${oldFile}` }, { icon: null, cover: `file:${newFile}` })).toBe(true);
    expect(dropsShownImage({ icon: `file:${oldFile}`, cover: null }, { icon: "🚀", cover: null })).toBe(true);
  });

  it("should be false when the image stays, moves its focal point, or was never an upload", () => {
    expect(dropsShownImage({ icon: null, cover: `file:${oldFile}@30` }, { icon: null, cover: `file:${oldFile}@60` })).toBe(false);
    expect(dropsShownImage({ icon: null, cover: "mist" }, { icon: null, cover: null })).toBe(false);
    expect(dropsShownImage({ icon: null, cover: null }, { icon: null, cover: `file:${newFile}` })).toBe(false);
  });
});
