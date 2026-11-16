import { describe, expect, it } from "vitest";

import { fixtureArtifact } from "@/components/dev/fixture-content";

import { byId, seedKey, withMissing } from "./full-artifact-rules";

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

  it("should change when the seed brings a new save of an artifact it had", () => {
    expect(seedKey([{ ...note("a"), updatedAt: "2026-11-15T10:00:01.000Z" }])).not.toBe(seedKey([{ ...note("a"), updatedAt: "2026-11-15T10:00:00.000Z" }]));
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

  it("should replace a held artifact when the seed holds a later save of it", () => {
    const held = byId([{ ...note("a", "before the last save"), updatedAt: "2026-11-15T10:00:00.000Z" }]);
    const next = withMissing(held, [{ ...note("a", "after the last save"), updatedAt: "2026-11-15T10:00:01.000Z" }]);
    expect(next.get("a")?.content).toBe("after the last save");
  });

  it("should keep a held artifact when the seed holds an earlier save of it", () => {
    const held = byId([{ ...note("a", "just saved"), updatedAt: "2026-11-15T10:00:01.000Z" }]);
    expect(withMissing(held, [{ ...note("a", "older copy"), updatedAt: "2026-11-15T10:00:00.000Z" }])).toBe(held);
  });
});
