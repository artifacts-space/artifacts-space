import { describe, expect, it } from "vitest";

import { commentOptions, commentsWaitForApproval, previewComments } from "./comment-options";
import type { ShareTeam } from "./share-teams-context";

const personal: ShareTeam = { id: "p", slug: "me", name: "Me", personal: true, role: "owner", teamSharingNeedsApproval: false };
const strict: ShareTeam = { id: "s", slug: "strict", name: "Strict", personal: false, role: "member", teamSharingNeedsApproval: true };

describe("commentOptions", () => {
  it("should call the team option Only you when the artifact has no shared team", () => {
    expect(commentOptions("link", personal)[1]?.title).toBe("Only you");
    expect(commentOptions("private", undefined)[1]?.title).toBe("Only you");
  });

  it("should call the team option Team members in a shared team", () => {
    expect(commentOptions("public", strict)[1]?.title).toBe("Team members");
  });
});

describe("previewComments", () => {
  it("should show comments off when a private artifact is shared by link in a personal team", () => {
    expect(previewComments({ current: "team", currentTeamId: null, visibility: "link", team: personal })).toBe("off");
  });

  it("should keep the current setting when the team stays the same", () => {
    expect(previewComments({ current: "signed_in", currentTeamId: "p", visibility: "public", team: personal })).toBe("signed_in");
  });
});

describe("commentsWaitForApproval", () => {
  it("should say so when a member opens comments to anyone signed in in a shared team", () => {
    expect(commentsWaitForApproval({ current: "team", next: "signed_in", currentTeamId: "s", visibility: "public", team: strict })).toBe(true);
  });

  it("should not wait for narrowing or for a personal team", () => {
    expect(commentsWaitForApproval({ current: "signed_in", next: "off", currentTeamId: "s", visibility: "public", team: strict })).toBe(false);
    expect(commentsWaitForApproval({ current: "off", next: "signed_in", currentTeamId: "p", visibility: "public", team: personal })).toBe(false);
  });
});
