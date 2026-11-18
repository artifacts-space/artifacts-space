import { describe, expect, it } from "vitest";

import {
  heirLabel,
  leaveConfirmKind,
  leaveSummary,
  movableIds,
  movedMessage,
  moveProblems,
  removalConfirmKind,
  removalDescription,
  shownArtifacts,
  type DepartingArtifact,
  type LeavePreview,
} from "./departure-rules";

const item = (n: number): DepartingArtifact => ({ id: `a-${String(n)}`, publicId: `p-${String(n)}`, title: `Plan ${String(n)}` });
const ada = { name: "Ada Lovelace", username: "ada" };
const previewOf = (total: number, listed = total): LeavePreview => ({ total, artifacts: Array.from({ length: listed }, (_, index) => item(index + 1)), heir: ada });

describe("heirLabel", () => {
  it("should name the new owner by name and handle when both exist", () => {
    expect(heirLabel(ada)).toBe("Ada Lovelace (@ada)");
  });

  it("should use whichever of the two exists", () => {
    expect(heirLabel({ name: "", username: "ada" })).toBe("@ada");
    expect(heirLabel({ name: "Ada", username: null })).toBe("Ada");
  });

  it("should fall back to the role when nobody is known", () => {
    expect(heirLabel(null)).toBe("the team's longest-standing owner");
    expect(heirLabel({ name: "  ", username: null })).toBe("the team's longest-standing owner");
  });
});

describe("leaveSummary", () => {
  it("should say how many stay with the team and who becomes their owner", () => {
    expect(leaveSummary(previewOf(3))).toBe("3 of your artifacts live in this team. They stay with the team when you leave, and Ada Lovelace (@ada), its longest-standing owner, becomes their owner.");
  });

  it("should speak of one artifact in the singular", () => {
    expect(leaveSummary(previewOf(1))).toBe("One of your artifacts lives in this team. It stays with the team when you leave, and Ada Lovelace (@ada), its longest-standing owner, becomes its owner.");
  });

  it("should say nothing when none of the person's artifacts live in the team", () => {
    expect(leaveSummary(previewOf(0))).toBeNull();
  });
});

describe("leaveConfirmKind", () => {
  it("should keep the plain, skippable confirm when nothing stays behind", () => {
    expect(leaveConfirmKind(0)).toBe("leaveTeam");
  });

  it("should use the choice dialog, which cannot be skipped, when artifacts stay behind", () => {
    expect(leaveConfirmKind(1)).toBe("choice");
  });
});

describe("removalDescription", () => {
  it("should tell the remover that the member's artifacts stay and who takes them", () => {
    expect(removalDescription({ artifacts: 2, heir: ada })).toBe(
      "They lose access to this team at once. 2 of their artifacts live in this team. They stay with the team, and Ada Lovelace (@ada), its longest-standing owner, becomes their owner. Agents they added go to the team's owner, and their tokens stop working at once.",
    );
  });

  it("should say none stay when the member has no artifacts in the team", () => {
    expect(removalDescription({ artifacts: 0, heir: ada })).toContain("None of their artifacts live in this team.");
  });

  it("should keep the general sentence when the facts were not loaded", () => {
    expect(removalDescription(null)).toContain("Artifacts they shared with the team stay with the team");
  });
});

describe("removalConfirmKind", () => {
  it("should ask under its own kind when artifacts stay, so a skipped plain removal never hides it", () => {
    expect(removalConfirmKind({ artifacts: 1, heir: ada })).toBe("removeMemberWithArtifacts");
    expect(removalConfirmKind({ artifacts: 0, heir: ada })).toBe("removeMember");
    expect(removalConfirmKind(null)).toBe("removeMember");
  });
});

describe("shownArtifacts", () => {
  it("should show five titles and count the rest", () => {
    const { shown, more } = shownArtifacts(previewOf(7), false);
    expect(shown.map((entry) => entry.title)).toEqual(["Plan 1", "Plan 2", "Plan 3", "Plan 4", "Plan 5"]);
    expect(more).toBe(2);
  });

  it("should show every loaded title once asked, and count only what was not loaded", () => {
    expect(shownArtifacts(previewOf(7), true)).toMatchObject({ more: 0 });
    expect(shownArtifacts(previewOf(130, 100), true)).toMatchObject({ more: 30 });
  });

  it("should show no count when everything fits", () => {
    expect(shownArtifacts(previewOf(4), false)).toMatchObject({ more: 0 });
  });
});

describe("movableIds", () => {
  const own = [item(1), item(2)];

  it("should allow only the person's own artifacts in the team", () => {
    expect(movableIds(["a-1", "someone-elses", "a-2"], own)).toEqual({ allowed: own, unknown: 1 });
  });

  it("should take an id once however often it was sent", () => {
    expect(movableIds(["a-1", "a-1"], own).allowed).toEqual([item(1)]);
  });

  it("should allow nothing when the person has nothing in the team", () => {
    expect(movableIds(["a-1"], [])).toEqual({ allowed: [], unknown: 1 });
  });
});

describe("movedMessage and moveProblems", () => {
  it("should name a single moved artifact and count several", () => {
    expect(movedMessage({ moved: [item(1)], waiting: [], refused: [] })).toBe("Moved “Plan 1” to Personal.");
    expect(movedMessage({ moved: [item(1), item(2)], waiting: [], refused: [] })).toBe("Moved 2 artifacts to Personal.");
    expect(movedMessage({ moved: [], waiting: [item(1)], refused: [] })).toBeNull();
  });

  it("should say that a waiting move has not happened and where the artifact goes on leaving", () => {
    expect(moveProblems({ moved: [], waiting: [item(1)], refused: [] })).toEqual([
      "“Plan 1” waits for an owner's or admin's approval, so it is still in this team. If you leave now, it goes to the new owner.",
    ]);
  });

  it("should name each refused artifact with its reason", () => {
    expect(moveProblems({ moved: [], waiting: [], refused: [{ artifact: item(2), reason: "Artifact not found." }] })).toEqual(["“Plan 2” did not move: Artifact not found."]);
  });

  it("should have nothing to say when everything moved", () => {
    expect(moveProblems({ moved: [item(1)], waiting: [], refused: [] })).toEqual([]);
  });
});
