import { describe, expect, it } from "vitest";

import { fixtureArtifact } from "@/components/dev/fixture-content";

import { byId, ownSavesKey, seedKey, withMissing, withOwnSaves } from "./full-artifact-rules";

const note = (id: string, content = "x") => fixtureArtifact({ id, kind: "markdown", title: id, content });

describe("seedKey", () => {
  it("should stay the same when a re-render passes a new array with the same artifacts", () => {
    const first = [note("a"), note("b")];
    const again = [note("a"), note("b")];
    expect(again).not.toBe(first);
    expect(seedKey(again)).toBe(seedKey(first));
  });

  it("should change when the seed brings an artifact not seen before", () => {
    expect(seedKey([note("a"), note("c")])).not.toBe(seedKey([note("a")]));
  });

  it("should treat no seed and an empty seed alike", () => {
    expect(seedKey(undefined)).toBe(seedKey([]));
  });
});

describe("withMissing", () => {
  it("should hand back the same map when the seed has nothing new, so the loaded state is neither reset nor changed", () => {
    const held = byId([note("a", "just saved")]);
    const next = withMissing(held, [note("a", "older copy")]);
    expect(next).toBe(held);
    expect(next.get("a")?.content).toBe("just saved");
  });

  it("should add only the artifacts not held yet", () => {
    const held = byId([note("a", "just saved")]);
    const next = withMissing(held, [note("a", "older copy"), note("b")]);
    expect(next).not.toBe(held);
    expect(next.get("a")?.content).toBe("just saved");
    expect(next.has("b")).toBe(true);
  });
});

describe("withMissing with a later save in the seed", () => {
  it("should keep the held copy when the server's answer holds someone else's later save, so the editor's conflict check stays on its own version", () => {
    const held = byId([{ ...note("a", "the person's base"), updatedAt: "2026-11-15T10:00:00.000Z" }]);
    const next = withMissing(held, [{ ...note("a", "someone else's save"), updatedAt: "2026-11-15T10:00:05.000Z" }]);
    expect(next).toBe(held);
    expect(next.get("a")?.content).toBe("the person's base");
  });
});

describe("withOwnSaves", () => {
  it("should take this tab's later save of a held artifact when a blank page's last save lands after the pane took it over", () => {
    const held = byId([{ ...note("a", "before the last save"), updatedAt: "2026-11-15T10:00:00.000Z" }]);
    const next = withOwnSaves(held, [{ ...note("a", "after the last save"), updatedAt: "2026-11-15T10:00:01.000Z" }]);
    expect(next.get("a")?.content).toBe("after the last save");
  });

  it("should hand back the same map when the save is not later than the held copy", () => {
    const held = byId([{ ...note("a", "just saved"), updatedAt: "2026-11-15T10:00:01.000Z" }]);
    expect(withOwnSaves(held, [{ ...note("a", "older"), updatedAt: "2026-11-15T10:00:00.000Z" }])).toBe(held);
  });

  it("should leave artifacts the pane does not hold to the seed", () => {
    const held = byId([note("a")]);
    expect(withOwnSaves(held, [note("b")])).toBe(held);
  });
});

describe("ownSavesKey", () => {
  it("should change when a save of the same artifact is newer", () => {
    expect(ownSavesKey([{ ...note("a"), updatedAt: "2026-11-15T10:00:01.000Z" }])).not.toBe(ownSavesKey([{ ...note("a"), updatedAt: "2026-11-15T10:00:00.000Z" }]));
  });
});
