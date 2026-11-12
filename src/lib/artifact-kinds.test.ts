import { describe, expect, it } from "vitest";

import { artifactKinds } from "@/lib/artifact-types";

import { showsFormatChip } from "./artifact-kinds";

describe("showsFormatChip", () => {
  it("should hide the chip when the artifact is Markdown", () => {
    expect(showsFormatChip("markdown")).toBe(false);
  });

  it("should show the chip when the artifact is any other format", () => {
    expect(artifactKinds.filter((kind) => kind !== "markdown").every(showsFormatChip)).toBe(true);
  });
});
