import { beforeEach, describe, expect, it, vi } from "vitest";

import { presetTheme } from "./resolve";
import type { ArtifactThemeContext } from "./team-preset-rules";

/*
 * Saving a team preset id on an artifact: allowed only when the artifact can
 * render with it (its team's preset, or one of the author's teams while it
 * is private) and the editor belongs to that team. The context loader and
 * the membership lookup are mocked at the database boundary.
 */

const mocks = vi.hoisted(() => ({ context: vi.fn(), membership: vi.fn() }));
vi.mock("./artifact-theme-context", () => ({ loadArtifactThemeContext: mocks.context }));
vi.mock("@/lib/teams/queries", () => ({ getTeamMembershipById: mocks.membership }));

const { assertTeamPresetUsable } = await import("./team-preset-access");

const ocean = presetTheme("ocean");
const ref = "team:brand-abc234";
const subject = { userId: "author-1", visibility: "team", teamId: "team-a" };

function contextWith(teamId: string): ArtifactThemeContext {
  if (!ocean) throw new Error("ocean preset missing");
  return { teamDefault: null, presets: new Map([[ref, { ref, teamId, name: "Brand", theme: ocean }]]) };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("assertTeamPresetUsable", () => {
  it("should pass built-in ids, theme JSON, and null without a lookup", async () => {
    await assertTeamPresetUsable("editor-1", subject, "paper");
    await assertTeamPresetUsable("editor-1", subject, null);
    await assertTeamPresetUsable("editor-1", subject, { version: 1 });
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it("should accept the artifact team's preset when the editor belongs to the team", async () => {
    mocks.context.mockResolvedValue(contextWith("team-a"));
    mocks.membership.mockResolvedValue({ id: "team-a" });
    await expect(assertTeamPresetUsable("editor-1", subject, ref)).resolves.toBeUndefined();
    expect(mocks.context).toHaveBeenCalledWith(subject, [ref]);
    expect(mocks.membership).toHaveBeenCalledWith("editor-1", "team-a");
  });

  it("should refuse another team's or a deleted preset when the artifact cannot render with it", async () => {
    mocks.context.mockResolvedValue({ teamDefault: null, presets: new Map() });
    await expect(assertTeamPresetUsable("editor-1", subject, ref)).rejects.toThrow(/is not a theme preset this artifact can use/);
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it("should refuse when the editor is not a member of the preset's team", async () => {
    mocks.context.mockResolvedValue(contextWith("team-a"));
    mocks.membership.mockResolvedValue(null);
    await expect(assertTeamPresetUsable("outsider-1", subject, ref)).rejects.toThrow(/themes_list shows them/);
  });
});
