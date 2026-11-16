import { describe, expect, it } from "vitest";

import { parseGalleryFilter, showsGroup, showsSpecimen } from "./gallery-filter";

describe("gallery filter", () => {
  it("should show every group and specimen when no show value is given", () => {
    for (const show of [undefined, [], "", ["  ", "/"]]) {
      const filter = parseGalleryFilter(show);
      expect(filter).toBeNull();
      expect(showsGroup(filter, "Input")).toBe(true);
      expect(showsSpecimen(filter, "specs", "Sign-in screen")).toBe(true);
    }
  });

  it("should show a whole group and nothing else when only its id is given", () => {
    const filter = parseGalleryFilter("Input");
    expect(showsGroup(filter, "Input")).toBe(true);
    expect(showsSpecimen(filter, "Input", "Normal")).toBe(true);
    expect(showsGroup(filter, "Textarea")).toBe(false);
    expect(showsSpecimen(filter, "Textarea", "Normal")).toBe(false);
  });

  it("should show only the named specimens of a group when names follow its id", () => {
    const filter = parseGalleryFilter(["specs/Sign-in screen", "specs/Surfaces and tones", "Box"]);
    expect(showsGroup(filter, "specs")).toBe(true);
    expect(showsSpecimen(filter, "specs", "Sign-in screen")).toBe(true);
    expect(showsSpecimen(filter, "specs", "Surfaces and tones")).toBe(true);
    expect(showsSpecimen(filter, "specs", "Landing page")).toBe(false);
    expect(showsSpecimen(filter, "Box", "Scrolling row")).toBe(true);
  });

  it("should keep a slash in a specimen's name when the name holds one", () => {
    const filter = parseGalleryFilter("formats/csv · a/b");
    expect(showsSpecimen(filter, "formats", "csv · a/b")).toBe(true);
    expect(showsSpecimen(filter, "formats", "csv · a")).toBe(false);
  });

  it("should keep a group whole when it is asked for whole and by one specimen", () => {
    for (const show of [["themes", "themes/theme · ocean"], ["themes/theme · ocean", "themes"], ["themes/theme · ocean", "themes/"]]) {
      expect(showsSpecimen(parseGalleryFilter(show), "themes", "cover picker")).toBe(true);
    }
  });
});
