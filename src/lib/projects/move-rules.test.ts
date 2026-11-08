import { describe, expect, it } from "vitest";

import { crossSpaceMessage } from "./move-rules";

describe("crossSpaceMessage", () => {
  it("should ask to share with the team first when a private artifact goes to a team project", () => {
    expect(crossSpaceMessage("Launch", { kind: "team", name: "Acme" }, { kind: "own" })).toBe("Share it with Acme first to put it in Launch.");
  });

  it("should ask to share with the other team first when the artifact belongs to a different team", () => {
    expect(crossSpaceMessage("Launch", { kind: "team", name: "Acme" }, { kind: "team", name: "Globex" })).toBe("Share it with Acme first to put it in Launch.");
  });

  it("should ask to stop sharing first when a team artifact goes to the viewer's own project", () => {
    expect(crossSpaceMessage("Design", { kind: "own" }, { kind: "team", name: "Acme" })).toBe("Stop sharing it with Acme first to put it in Design.");
  });

  it("should say it uses its author's projects when someone else wrote it", () => {
    expect(crossSpaceMessage("Design", { kind: "own" }, { kind: "other" })).toBe("It uses its author's projects, so it cannot go in Design.");
  });
});
