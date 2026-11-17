import { describe, expect, it } from "vitest";

import {
  homeMove,
  homeTeamOf,
  elsewhereName,
  listAfterSave,
  listedInWorkspace,
  listWithReturned,
  movedMessage,
  moveHref,
  moveSentence,
  openLabel,
  returnedMessage,
  saveLabel,
  teamPickerLabel,
  undoResult,
  type HomeMove,
} from "./home-move-rules";

const own = { id: "t-own", slug: "me", name: "Me", personal: true };
const acme = { id: "t-acme", slug: "acme", name: "Acme", personal: false };
const globex = { id: "t-globex", slug: "globex", name: "Globex", personal: false };
const teams = [own, acme, globex];

const isPrivate = { visibility: "private", teamId: null };
const inAcme = { visibility: "team", teamId: acme.id };
const linkByAcme = { visibility: "link", teamId: acme.id };
const linkByOwn = { visibility: "link", teamId: own.id };
const inOther = { visibility: "team", teamId: "t-elsewhere" };

describe("homeTeamOf", () => {
  it("should name the shared team an artifact is shared through as its home", () => {
    expect(homeTeamOf(inAcme, teams)).toBe(acme);
  });

  it("should give a link or public artifact approved by a shared team that team as its home too", () => {
    expect(homeTeamOf(linkByAcme, teams)).toBe(acme);
  });

  it("should leave the home with the person when it is private, by link through their personal team, or in a team they are not in", () => {
    expect(homeTeamOf(isPrivate, teams)).toBeNull();
    expect(homeTeamOf({ visibility: "private", teamId: acme.id }, teams)).toBeNull();
    expect(homeTeamOf(linkByOwn, teams)).toBeNull();
    expect(homeTeamOf(inOther, teams)).toBeNull();
  });
});

describe("listedInWorkspace", () => {
  it("should list an artifact shared through a team only in that team's workspace, never in Personal", () => {
    expect(listedInWorkspace(inAcme, teams, null)).toBe(false);
    expect(listedInWorkspace(inAcme, teams, acme.id)).toBe(true);
    expect(listedInWorkspace(inAcme, teams, globex.id)).toBe(false);
  });

  it("should list a private artifact only in Personal", () => {
    expect(listedInWorkspace(isPrivate, teams, null)).toBe(true);
    expect(listedInWorkspace(isPrivate, teams, acme.id)).toBe(false);
  });
});

describe("homeMove", () => {
  it("should be a move to the team when a private artifact is shared with a team", () => {
    expect(homeMove(isPrivate, inAcme, teams)).toEqual({ to: "team", team: acme, from: null });
  });

  it("should be a move back to Personal when a team's artifact is made private", () => {
    expect(homeMove(inAcme, isPrivate, teams)).toEqual({ to: "personal", from: acme });
  });

  it("should be a move between teams when the team changes", () => {
    expect(homeMove(inAcme, { visibility: "team", teamId: globex.id }, teams)).toEqual({ to: "team", team: globex, from: acme });
  });

  it("should be no move when the home stays: a link through the personal team, or another level in the same team", () => {
    expect(homeMove(isPrivate, linkByOwn, teams)).toBeNull();
    expect(homeMove(inAcme, linkByAcme, teams)).toBeNull();
    expect(homeMove(isPrivate, isPrivate, teams)).toBeNull();
  });

  it("should be a move when a link is approved by a shared team, since that team becomes its home", () => {
    expect(homeMove(isPrivate, linkByAcme, teams)).toEqual({ to: "team", team: acme, from: null });
  });
});

describe("the words for a move", () => {
  const toAcme: HomeMove = { to: "team", team: acme, from: null };
  const toGlobex: HomeMove = { to: "team", team: globex, from: acme };
  const back: HomeMove = { to: "personal", from: acme };

  it("should name the move on the button, and say Save when nothing moves", () => {
    expect(saveLabel(toAcme, "apply")).toBe("Move to Acme");
    expect(saveLabel(back, "apply")).toBe("Move to Personal");
    expect(saveLabel(null, "apply")).toBe("Save");
    expect(saveLabel(null, "pending")).toBe("Save");
  });

  it("should only ask on the button when the move waits for an approval", () => {
    expect(saveLabel(toAcme, "pending")).toBe("Ask to move to Acme");
  });

  it("should label the team picker with the move, and with Team once the artifact is there", () => {
    expect(teamPickerLabel(toAcme)).toBe("Move to");
    expect(teamPickerLabel(toGlobex)).toBe("Move to");
    expect(teamPickerLabel(null)).toBe("Team");
  });

  it("should say what it leaves when the move applies at once", () => {
    expect(moveSentence(toAcme, "apply")).toBe("It moves to Acme and leaves your personal artifacts.");
    expect(moveSentence(toGlobex, "apply")).toBe("It moves to Globex and leaves Acme.");
    expect(moveSentence(back, "apply")).toBe("It moves back to your personal artifacts and leaves Acme.");
  });

  it("should say the move waits when the team's rule needs an approval", () => {
    expect(moveSentence(toAcme, "pending")).toBe("Once approved, it moves to Acme and leaves your personal artifacts.");
  });

  it("should say where it went in the toast, and offer to open it there", () => {
    expect(movedMessage("Plan", toAcme)).toBe("Moved “Plan” to Acme.");
    expect(movedMessage("  ", back)).toBe("Moved “Untitled artifact” back to Personal.");
    expect(openLabel(toAcme)).toBe("Open in Acme");
    expect(openLabel(back)).toBe("Open in Personal");
    expect(moveHref("/app", toAcme, "abc123")).toBe("/app?team=acme&artifact=abc123");
    expect(moveHref("/app", back, "abc123")).toBe("/app?artifact=abc123");
  });

  it("should say where it is again after Undo", () => {
    expect(returnedMessage("Plan", null)).toBe("“Plan” is back in your personal artifacts.");
    expect(returnedMessage("", "Acme")).toBe("“Untitled artifact” is back in Acme.");
  });
});

describe("listAfterSave", () => {
  const item = (id: string, sharing: { visibility: string; teamId: string | null } = isPrivate) => ({ id, ...sharing });
  const list = [item("a"), item("b"), item("c")];

  it("should take an artifact out of Personal at once when a save moved it to a team", () => {
    expect(listAfterSave(list, item("b", inAcme), teams, null).map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("should bring it back first when the move is undone", () => {
    const without = listAfterSave(list, item("b", inAcme), teams, null);
    expect(listWithReturned(without, item("b")).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
    expect(listWithReturned(list, item("b")).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });

  it("should replace it in place when it stays in this workspace", () => {
    const next = listAfterSave(list, item("b", linkByOwn), teams, null);
    expect(next.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(next[1]).toMatchObject({ visibility: "link" });
  });

  it("should take an artifact out of a team's workspace when it is made private, and keep it when only its level changes", () => {
    const inTeam = [item("a", inAcme), item("b", inAcme)];
    expect(listAfterSave(inTeam, item("b"), teams, acme.id).map((entry) => entry.id)).toEqual(["a"]);
    expect(listAfterSave(inTeam, item("b", linkByAcme), teams, acme.id).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("should keep an artifact a link opened here, which this workspace never listed, and never add one that belongs elsewhere", () => {
    const withVisitor = [item("a"), item("v", inAcme)];
    expect(listAfterSave(withVisitor, item("v", linkByAcme), teams, null).map((entry) => entry.id)).toEqual(["a", "v"]);
    expect(listAfterSave(list, item("z", inAcme), teams, null).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("undoResult", () => {
  it("should say it returned when the Undo put it back in the workspace that shows it", () => {
    expect(undoResult(inAcme, isPrivate, teams, null)).toEqual({ kind: "returned" });
    expect(undoResult(isPrivate, inAcme, teams, acme.id)).toEqual({ kind: "returned" });
  });

  it("should say where it went when the Undo applied and its home is another workspace, never that a request was sent", () => {
    // In Acme's workspace: the viewer's private artifact, opened by a link, was moved to Acme; Undo makes it private again.
    expect(undoResult(inAcme, isPrivate, teams, acme.id)).toEqual({ kind: "elsewhere", move: { to: "personal", from: acme } });
    expect(undoResult(isPrivate, inAcme, teams, globex.id)).toEqual({ kind: "elsewhere", move: { to: "team", team: acme, from: null } });
  });

  it("should say it stayed when the server filed a request and its home did not change, never that it is back", () => {
    // Made private from Acme's workspace; the Undo's share with Acme now waits for an approval, so it is still private.
    expect(undoResult(isPrivate, isPrivate, teams, acme.id)).toEqual({ kind: "stayed" });
    expect(undoResult(inAcme, inAcme, teams, null)).toEqual({ kind: "stayed" });
  });
});

describe("elsewhereName", () => {
  it("should name the team on a row whose artifact a link opened outside the team's workspace", () => {
    expect(elsewhereName({ ...inAcme, own: true }, teams, null)).toBe("Acme");
    expect(elsewhereName({ ...linkByAcme, own: false }, teams, globex.id)).toBe("Acme");
  });

  it("should name Personal on a row of the viewer's own private artifact opened in a team's workspace", () => {
    expect(elsewhereName({ ...isPrivate, own: true }, teams, acme.id)).toBe("Personal");
  });

  it("should name nothing on a row at home, or on someone else's artifact with no workspace of the viewer's", () => {
    expect(elsewhereName({ ...inAcme, own: true }, teams, acme.id)).toBeNull();
    expect(elsewhereName({ ...isPrivate, own: true }, teams, null)).toBeNull();
    expect(elsewhereName({ ...linkByOwn, own: true }, teams, null)).toBeNull();
    expect(elsewhereName({ visibility: "link", teamId: "t-elsewhere", own: false }, teams, acme.id)).toBeNull();
    expect(elsewhereName({ visibility: "link", teamId: "t-elsewhere", own: false }, teams, null)).toBeNull();
  });
});
