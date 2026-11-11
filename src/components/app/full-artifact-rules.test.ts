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
