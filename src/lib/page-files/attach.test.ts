import { describe, expect, it } from "vitest";

import { sharedPagePath } from "./attach";

describe("sharedPagePath", () => {
  it("should find a path the page already has", () => {
    expect(sharedPagePath([{ pagePath: "css/site.css" }], [{ pagePath: "js/app.js" }, { pagePath: "css/site.css" }])).toBe("css/site.css");
  });

  it("should count paths that differ only by letter case as one", () => {
    expect(sharedPagePath([{ pagePath: "img/Logo.png" }], [{ pagePath: "img/logo.png" }])).toBe("img/logo.png");
    expect(sharedPagePath([], [{ pagePath: "a.css" }, { pagePath: "A.CSS" }])).toBe("A.CSS");
  });

  it("should find none among paths that all differ", () => {
    expect(sharedPagePath([{ pagePath: "css/site.css" }], [{ pagePath: "js/site.css" }, { pagePath: "css/site2.css" }])).toBeNull();
    expect(sharedPagePath([], [])).toBeNull();
  });
});
