import { describe, expect, it } from "vitest";

import { visibilityCopy, visibilitySentence } from "./visibility-copy";

describe("visibilityCopy", () => {
  it("should say only the author can see it when the artifact is private", () => {
    expect(visibilityCopy("private")).toEqual({ label: "Private", kicker: "Private", showAuthor: false, note: "Only you can see this.", showSignUp: false });
  });

  it("should say only team members can see it when the artifact is shared with a team", () => {
    const copy = visibilityCopy("team");
    expect(copy.label).toBe("Team");
    expect(copy.kicker).toBe("Team only");
    expect(copy.note).toBe("Only team members can see this.");
    expect(copy.showAuthor).toBe(true);
  });

  it("should keep the user-shared content notice when anyone with the link or anyone at all can read it", () => {
    for (const visibility of ["link", "public"] as const) {
      const copy = visibilityCopy(visibility);
      expect(copy.kicker).toBe("Shared artifact");
      expect(copy.note).toContain("This is user-shared content; artifacts.space does not review it.");
      expect(copy.showSignUp).toBe(true);
    }
  });

  it("should tell link and public apart when labelling them", () => {
    const link = visibilityCopy("link");
    const everyone = visibilityCopy("public");
    expect(link.label).toBe("Link");
    expect(link.note).toMatch(/^Anyone with the link can see this\./);
    expect(everyone.label).toBe("Public");
    expect(everyone.note).toMatch(/^Anyone can see this\./);
  });
});

describe("visibilitySentence", () => {
  it("should read as the label and who can see it when the artifact is private", () => {
    expect(visibilitySentence(visibilityCopy("private"), { author: "Dana", teamName: null })).toBe("Private. Only you can see this.");
  });

  it("should name who shared it and the team when the artifact is shared with a team", () => {
    expect(visibilitySentence(visibilityCopy("team"), { author: "Dana", teamName: "Platform" })).toBe("Team. Shared by Dana in Platform. Only team members can see this.");
  });

  it("should name who shared it without a team when a public artifact has none", () => {
    expect(visibilitySentence(visibilityCopy("public"), { author: "Dana", teamName: null })).toBe(
      "Public. Shared by Dana. Anyone can see this. This is user-shared content; artifacts.space does not review it.",
    );
  });

  it("should leave out who shared it when there is no byline", () => {
    expect(visibilitySentence(visibilityCopy("link"))).toBe("Link. Anyone with the link can see this. This is user-shared content; artifacts.space does not review it.");
  });
});
