import { describe, expect, it } from "vitest";

import { teamAvatar } from "./team-avatar-rules";

const team = { id: "team-1", personal: false };

describe("teamAvatar", () => {
  it("should show the viewer's own avatar when the workspace is their own artifacts", () => {
    expect(teamAvatar(null, "user-1")).toEqual({ kind: "person", seed: "user-1" });
  });

  it("should show the viewer's own avatar when the team is personal, even with an icon url", () => {
    expect(teamAvatar({ id: "personal-team", personal: true, iconUrl: "/api/teams/personal-team/icon" }, "user-1")).toEqual({ kind: "person", seed: "user-1" });
  });

  it("should show the team's uploaded icon when it has one, falling back to its id", () => {
    expect(teamAvatar({ ...team, iconUrl: "/api/teams/team-1/icon?v=abc" }, "user-1")).toEqual({ kind: "image", url: "/api/teams/team-1/icon?v=abc", fallbackSeed: "team-1" });
  });

  it("should seed the team's pixel avatar by its id when it has no icon", () => {
    expect(teamAvatar({ ...team, iconUrl: null }, "user-1")).toEqual({ kind: "team", seed: "team-1" });
    expect(teamAvatar(team, "user-1")).toEqual({ kind: "team", seed: "team-1" });
  });

  it("should give a team the same seed for every viewer, and different teams different seeds", () => {
    expect(teamAvatar(team, "user-1")).toEqual(teamAvatar(team, "user-2"));
    expect(teamAvatar({ id: "team-2", personal: false }, "user-1")).not.toEqual(teamAvatar(team, "user-1"));
  });
});
