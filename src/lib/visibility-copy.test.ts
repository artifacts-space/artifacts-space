import { describe, expect, it } from "vitest";

import { visibilityCopy } from "./visibility-copy";

describe("visibilityCopy", () => {
  it("should say only the author can see it when the artifact is private", () => {
    expect(visibilityCopy("private")).toEqual({ kicker: "Private", showAuthor: false, note: "Private. Only you can see this.", showSignUp: false });
  });

  it("should say only team members can see it when the artifact is shared with a team", () => {
    const copy = visibilityCopy("team");
    expect(copy.kicker).toBe("Team only");
    expect(copy.note).toBe("Only team members can see this.");
    expect(copy.showAuthor).toBe(true);
  });

  it("should keep the user-shared content notice when anyone with the link or anyone at all can read it", () => {
    for (const visibility of ["link", "public"] as const) {
      const copy = visibilityCopy(visibility);
      expect(copy.kicker).toBe("Shared artifact");
      expect(copy.note).toBe("This is user-shared content; artifacts.space does not review it.");
      expect(copy.showSignUp).toBe(true);
    }
  });
});
