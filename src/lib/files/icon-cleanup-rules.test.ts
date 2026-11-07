import { describe, expect, it } from "vitest";

import { unusedIconFiles, type IconUseState } from "./icon-cleanup-rules";

const oldFile = "0f8fad5b-d9cb-469f-a165-70867728950e";
const newFile = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const markdown: IconUseState = { icon: "🚀", kind: "markdown", content: "# Plan" };
const uiUsing = (fileId: string): IconUseState => ({
  icon: null,
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

  it("should keep everything in a file artifact, where every attachment is content", () => {
    expect(unusedIconFiles([oldFile], { ...markdown, kind: "file" }, [])).toEqual([]);
  });
});
