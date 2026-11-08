import { describe, expect, it } from "vitest";

import type { ArtifactVisibility } from "@/lib/artifact-types";

import { canDeleteArtifact, canEditArtifact, canViewArtifact, isAuthorOrActsFor, isIndexable, NEW_ACCOUNT_NOINDEX_DAYS, type AccessViewer } from "./access-rules";

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

/** Expected edit access in a shared (not personal) team. */
const editMatrix: Record<ArtifactVisibility, Record<keyof typeof viewers, boolean>> = {
  private: { signedOut: false, author: true, member: false, outsider: false },
  team: { signedOut: false, author: true, member: true, outsider: false },
  link: { signedOut: false, author: true, member: true, outsider: false },
  public: { signedOut: false, author: true, member: true, outsider: false },
};

describe("canEditArtifact", () => {
  for (const [visibility, row] of Object.entries(editMatrix)) {
    for (const [viewerName, expected] of Object.entries(row)) {
      it(`should ${expected ? "allow" : "deny"} ${viewerName} edits when the artifact is ${visibility} in a shared team`, () => {
        const shared = { ...subject(visibility as ArtifactVisibility), teamPersonal: false };
        expect(canEditArtifact(shared, viewers[viewerName] ?? null)).toBe(expected);
      });
    }
  }

  it("should keep link artifacts of a personal team author-only", () => {
    const personal = { ...subject("link"), teamPersonal: true };
    expect(canEditArtifact(personal, viewers.member ?? null)).toBe(false);
    expect(canEditArtifact(personal, viewers.author ?? null)).toBe(true);
  });

  it("should deny members when a shared artifact has lost its team", () => {
    expect(canEditArtifact({ ...subject("team", null), teamPersonal: null }, viewers.member ?? null)).toBe(false);
  });
});

describe("canDeleteArtifact", () => {
  it("should allow only the author when anyone else asks", () => {
    expect(canDeleteArtifact({ userId: author }, { userId: author, isTeamMember: false })).toBe(true);
    expect(canDeleteArtifact({ userId: author }, { userId: "member", isTeamMember: true })).toBe(false);
    expect(canDeleteArtifact({ userId: author }, null)).toBe(false);
  });
});

describe("an agent's artifacts and the person who added the agent", () => {
  // The author here is an agent. Only its owner, still in its team, gets actsForAuthor (src/lib/agents/owner-access.ts).
  const owner: AccessViewer = { userId: "agent-owner", isTeamMember: true, actsForAuthor: true };
  const notOwners: Record<string, AccessViewer> = {
    otherUser: { userId: "stranger", isTeamMember: false, actsForAuthor: false },
    teammate: { userId: "teammate", isTeamMember: true, actsForAuthor: false },
    ownerOfAnotherAgent: { userId: "other-owner", isTeamMember: true, actsForAuthor: false },
    siblingAgent: { userId: "sibling-agent", isTeamMember: true, actsForAuthor: false },
    flagLeftOut: { userId: "unknown", isTeamMember: true },
  };

  it("should let the owner read and edit the agent's private artifact when they act for it", () => {
    expect(canViewArtifact(subject("private"), owner)).toBe(true);
    expect(canEditArtifact({ ...subject("private"), teamPersonal: false }, owner)).toBe(true);
    expect(isAuthorOrActsFor(subject("private"), owner)).toBe(true);
  });

  for (const [name, viewer] of Object.entries(notOwners)) {
    it(`should deny ${name} the agent's private artifact when they do not act for the agent`, () => {
      expect(canViewArtifact(subject("private"), viewer)).toBe(false);
      expect(canEditArtifact({ ...subject("private"), teamPersonal: false }, viewer)).toBe(false);
      expect(isAuthorOrActsFor(subject("private"), viewer)).toBe(false);
    });
  }

  it("should let the owner delete the agent's artifact when they act for it", () => {
    expect(canDeleteArtifact({ userId: author }, owner)).toBe(true);
  });

  const nonOwnersWhoMayNotDelete: Record<string, AccessViewer> = {
    ...notOwners,
    // Admins of the agent's team withdraw sharing, but never delete a teammate's or an agent's work.
    teamAdminNotOwner: { userId: "team-admin", isTeamMember: true, actsForAuthor: false },
  };
  for (const [name, viewer] of Object.entries(nonOwnersWhoMayNotDelete)) {
    it(`should never let ${name} delete the agent's artifact when they do not act for the agent`, () => {
      expect(canDeleteArtifact({ userId: author }, viewer)).toBe(false);
    });
  }

  it("should deny everyone when no viewer is signed in", () => {
    expect(isAuthorOrActsFor(subject("private"), null)).toBe(false);
  });
});

describe("isIndexable", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const established = new Date("2026-10-01T00:00:00Z");

  it("should let search engines index public artifacts only when the account is established", () => {
    expect(isIndexable("public", established, now)).toBe(true);
    expect(isIndexable("link", established, now)).toBe(false);
    expect(isIndexable("team", established, now)).toBe(false);
    expect(isIndexable("private", established, now)).toBe(false);
  });

  it("should keep public pages out of search when the account is newer than the limit", () => {
    const justUnder = new Date(now.getTime() - NEW_ACCOUNT_NOINDEX_DAYS * 86_400_000 + 1000);
    expect(isIndexable("public", justUnder, now)).toBe(false);
  });

  it("should index public pages when the account reaches the limit exactly", () => {
    const atLimit = new Date(now.getTime() - NEW_ACCOUNT_NOINDEX_DAYS * 86_400_000);
    expect(isIndexable("public", atLimit, now)).toBe(true);
  });

  it("should treat an unknown account age as new", () => {
    expect(isIndexable("public", null, now)).toBe(false);
  });
});
