import { describe, expect, it } from "vitest";

import { legalHeading, legalHeadings, legalSections, type LegalDocument } from "./headings";

const documents: LegalDocument[] = ["privacy", "terms"];

describe("legal headings", () => {
  it.each(documents)("should give every %s heading a unique, URL-safe id", (document) => {
    const ids = legalHeadings[document].map((heading) => heading.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it.each(documents)("should start the %s document with a section, not a subsection", (document) => {
    expect(legalHeadings[document][0].level).toBe(2);
  });

  it("should return the heading when the id is listed", () => {
    expect(legalHeading("terms", "copyright")).toEqual({ id: "copyright", title: "Copyright and DMCA", level: 2 });
  });

  it("should throw when the id is not listed", () => {
    expect(() => legalHeading("privacy", "missing")).toThrow(/No "missing" heading/);
  });

  it("should list only top-level sections in the compact contents", () => {
    const sections = legalSections("privacy");
    expect(sections.every((heading) => heading.level === 2)).toBe(true);
    expect(sections.map((heading) => heading.id)).not.toContain("cookies");
  });
});
