import { describe, expect, it } from "vitest";

import { artifactListState } from "./artifact-list-state";

describe("artifactListState", () => {
  it("should be empty when there are no artifacts at all", () => {
    expect(artifactListState({ total: 0, shown: 0 })).toBe("empty");
  });

  it("should report a mismatch when artifacts exist but filters hide them all", () => {
    expect(artifactListState({ total: 3, shown: 0 })).toBe("no-match");
  });

  it("should show items when at least one artifact matches", () => {
    expect(artifactListState({ total: 3, shown: 1 })).toBe("items");
  });
});
