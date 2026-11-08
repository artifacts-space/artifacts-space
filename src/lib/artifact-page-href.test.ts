import { describe, expect, it } from "vitest";

import { artifactPageHref } from "./artifact-page-href";

describe("artifactPageHref", () => {
  it("should point at the artifact's own page when given its public id", () => {
    expect(artifactPageHref("abc123XYZ")).toBe("/artifact/abc123XYZ");
  });

  it("should keep the path in one segment when the id holds URL characters", () => {
    expect(artifactPageHref("a/b?c")).toBe("/artifact/a%2Fb%3Fc");
  });
});
