import { describe, expect, it } from "vitest";

import { formatKinds } from "@/lib/artifact-formats";
import { validateArtifactContent } from "@/lib/artifact-content";

import { formatDocs, formatErrorMessage } from "./format-docs";

describe("formatDocs", () => {
  it.each(formatKinds)("should save the %s example when it is checked", (kind) => {
    expect(validateArtifactContent(kind, formatDocs[kind].example).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it.each(formatKinds.filter((kind) => formatDocs[kind].broken !== undefined))("should refuse the broken %s example with a message", (kind) => {
    expect(formatErrorMessage(kind)).toBeTruthy();
  });
});
