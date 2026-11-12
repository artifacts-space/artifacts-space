import { describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

/*
 * What an agent gets back after its own save: the artifact as that save left
 * it and the token of that save, never a later read that names a person's
 * save the agent never saw. Version lookups are mocked at their boundary.
 */

vi.mock("@/lib/versions/history", () => ({ versionAt: (_id: string, at: Date) => Promise.resolve({ id: `version-at-${at.toISOString()}` }) }));

const { asSaved, baseVersionOf } = await import("./edit-conflict-tools");

function dto(overrides: Partial<ArtifactDto>): ArtifactDto {
  return {
    id: "internal-1", publicId: "4fXkP9qR2sT7vW1yZ3aB5c", title: "Answers", icon: null, theme: null, cover: null, fullWidth: false, sheetFormat: { banding: null, align: {} }, allowCsvDownload: false, summary: "", content: "# Answers", kind: "markdown", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-11T13:08:00.123Z", ...overrides,
  };
}

describe("asSaved", () => {
  const saved = dto({ content: "# Answers\n\nthe agent's", updatedAt: "2026-11-11T13:08:00.123Z" });

  it("should show what the agent saved, with the current sharing, when a person saved after the agent", () => {
    const current = dto({ content: "# Answers\n\nthe person's", updatedAt: "2026-11-11T13:08:05.000Z", visibility: "team" });
    const shown = asSaved(current, saved);
    expect(shown.content).toBe("# Answers\n\nthe agent's");
    expect(shown.updatedAt).toBe(saved.updatedAt);
    expect(shown.visibility).toBe("team");
  });

  it("should return the current artifact unchanged when nobody saved since", () => {
    const current = dto({ ...saved, visibility: "team" });
    expect(asSaved(current, saved)).toBe(current);
  });
});

describe("baseVersionOf", () => {
  it("should name the version that holds the save at the given time, with that save's token", async () => {
    await expect(baseVersionOf("internal-1", "2026-11-11T13:08:00.123Z")).resolves.toEqual({
      versionId: "version-at-2026-11-11T13:08:00.123Z",
      baseVersion: `version-at-2026-11-11T13:08:00.123Z.${String(Date.parse("2026-11-11T13:08:00.123Z"))}`,
    });
  });
});
