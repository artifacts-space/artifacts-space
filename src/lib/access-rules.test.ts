import { describe, expect, it } from "vitest";

import type { ArtifactVisibility } from "@/lib/artifact-types";

import { canEditArtifact, canViewArtifact, isIndexable, type AccessViewer } from "./access-rules";

const author = "author";
const subject = (visibility: ArtifactVisibility, teamId: string | null = "team-1") => ({ userId: author, visibility, teamId });

const viewers: Record<string, AccessViewer | null> = {
  signedOut: null,
  author: { userId: author, isTeamMember: true },
  member: { userId: "member", isTeamMember: true },
  outsider: { userId: "outsider", isTeamMember: false },
};

/** Expected read access for each visibility and viewer. */
const matrix: Record<ArtifactVisibility, Record<keyof typeof viewers, boolean>> = {
  private: { signedOut: false, author: true, member: false, outsider: false },
  team: { signedOut: false, author: true, member: true, outsider: false },
  link: { signedOut: true, author: true, member: true, outsider: true },
  public: { signedOut: true, author: true, member: true, outsider: true },
};

describe("canViewArtifact", () => {
  for (const [visibility, row] of Object.entries(matrix)) {
    for (const [viewerName, expected] of Object.entries(row)) {
      it(`should ${expected ? "allow" : "deny"} ${viewerName} when the artifact is ${visibility}`, () => {
        expect(canViewArtifact(subject(visibility as ArtifactVisibility), viewers[viewerName] ?? null)).toBe(expected);
      });
    }
  }

  it("should deny team members when a team artifact has lost its team", () => {
    expect(canViewArtifact(subject("team", null), viewers.member ?? null)).toBe(false);
  });

  it("should still let the author read a team artifact without a team", () => {
    expect(canViewArtifact(subject("team", null), viewers.author ?? null)).toBe(true);
  });
});

describe("canEditArtifact", () => {
  it("should allow only the author", () => {
    expect(canEditArtifact({ userId: author }, author)).toBe(true);
    expect(canEditArtifact({ userId: author }, "member")).toBe(false);
    expect(canEditArtifact({ userId: author }, null)).toBe(false);
  });
});

describe("isIndexable", () => {
  it("should let search engines index public artifacts only", () => {
    expect(isIndexable("public")).toBe(true);
    expect(isIndexable("link")).toBe(false);
    expect(isIndexable("team")).toBe(false);
    expect(isIndexable("private")).toBe(false);
  });
});
