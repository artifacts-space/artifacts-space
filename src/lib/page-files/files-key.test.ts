import { describe, expect, it } from "vitest";

import { pageFilesKeyOf } from "./files-key";

describe("pageFilesKeyOf", () => {
  it("should be undefined when the artifact has no page files", () => {
    expect(pageFilesKeyOf([{ id: "a", replacedAt: null }])).toBeUndefined();
  });

  it("should name each page file's id, path, and last replace when there are some", () => {
    const files = [{ id: "a", pagePath: "css/site.css", replacedAt: "2026-11-24T00:00:00.000Z" }, { id: "b", replacedAt: null }, { id: "c", pagePath: "js/app.js", replacedAt: null }];
    expect(pageFilesKeyOf(files)).toBe("a:css/site.css:2026-11-24T00:00:00.000Z|c:js/app.js:");
  });
});
