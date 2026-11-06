import { describe, expect, it } from "vitest";

import { artifactSizeLimits, artifactSizeProblem, byteLength } from "./artifact-limits";

describe("artifactSizeProblem", () => {
  it("should accept content at the byte limit when it is exactly 1 MB", () => {
    expect(artifactSizeProblem({ content: "a".repeat(artifactSizeLimits.maxContentBytes) })).toBeNull();
  });

  it("should reject content over the limit when multibyte characters push it past 1 MB", () => {
    const content = "é".repeat(artifactSizeLimits.maxContentBytes / 2 + 1);
    expect(byteLength(content)).toBeGreaterThan(artifactSizeLimits.maxContentBytes);
    expect(artifactSizeProblem({ content })).toMatch(/larger than 1 MB/);
  });

  it("should reject metadata over the limit when its JSON is too large", () => {
    expect(artifactSizeProblem({ metadata: { notes: "x".repeat(artifactSizeLimits.maxMetadataBytes) } })).toMatch(/64 KB/);
  });

  it("should accept an update when neither content nor metadata is sent", () => {
    expect(artifactSizeProblem({})).toBeNull();
  });
});
