import { describe, expect, it } from "vitest";

import { imageFileIdOf, unusedIconFiles, type IconUseState } from "./icon-cleanup-rules";

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
  it("should delete the old image when it was only the icon and nothing shows it now", () => {
    expect(unusedIconFiles([oldFile], markdown, [])).toEqual([oldFile]);
    expect(unusedIconFiles([oldFile], { ...markdown, icon: null }, [markdown])).toEqual([oldFile]);
  });

  it("should keep the image when the content still points at it from an Image element", () => {
    expect(unusedIconFiles([oldFile], uiUsing(oldFile), [])).toEqual([]);
  });

  it("should keep the image while the change waits for approval and the approved version still shows it", () => {
    const approved: IconUseState = { ...markdown, icon: `file:${oldFile}` };
    expect(unusedIconFiles([oldFile], markdown, [approved])).toEqual([]);
  });

  it("should keep an image a protected version points at from its content", () => {
    expect(unusedIconFiles([oldFile], markdown, [uiUsing(oldFile)])).toEqual([]);
  });

  it("should keep the image that is the icon now", () => {
    expect(unusedIconFiles([oldFile, newFile], { ...markdown, icon: `file:${newFile}` }, [])).toEqual([oldFile]);
  });

  it("should keep the image that is the cover now, with or without a focal point", () => {
    expect(unusedIconFiles([oldFile, newFile], { ...markdown, cover: `file:${newFile}@30` }, [])).toEqual([oldFile]);
    expect(unusedIconFiles([oldFile], { ...markdown, cover: `file:${oldFile}` }, [])).toEqual([]);
  });

  it("should delete an old cover image once a gradient replaced it and no protected version shows it", () => {
    expect(unusedIconFiles([oldFile], { ...markdown, cover: "mist" }, [])).toEqual([oldFile]);
    expect(unusedIconFiles([oldFile], { ...markdown, cover: "mist" }, [{ ...markdown, cover: `file:${oldFile}@10` }])).toEqual([]);
  });

  it("should find the file behind an icon or a cover value", () => {
    expect(imageFileIdOf(`file:${oldFile}`)).toBe(oldFile);
    expect(imageFileIdOf(`file:${oldFile}@75`)).toBe(oldFile);
    expect(imageFileIdOf("mist")).toBeNull();
    expect(imageFileIdOf("🚀")).toBeNull();
  });

  it("should keep everything in a file artifact, where every attachment is content", () => {
    expect(unusedIconFiles([oldFile], { ...markdown, kind: "file" }, [])).toEqual([]);
  });
});
