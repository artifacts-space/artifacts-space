import { describe, expect, it } from "vitest";

import { fixtureArtifact } from "./fixture-content";
import { createFixtureStore } from "./fixture-controls";

const note = fixtureArtifact({ id: "held", kind: "text", title: "Held", content: "Held.", publicId: "fixtureheld" });

describe("createFixtureStore", () => {
  it("should hold a load until it is released and then answer with the artifact", async () => {
    const store = createFixtureStore();
    store.setArtifacts([note]);
    let settled = false;
    const result = store.load("fixtureheld").then((value) => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(store.held()).toBe(1);

    store.release();
    await expect(result).resolves.toEqual({ success: true, data: note });
    expect(store.held()).toBe(0);
  });

  it("should answer not found when the released load asks for an artifact it does not hold", async () => {
    const store = createFixtureStore();
    const result = store.load("missing");
    store.release();
    await expect(result).resolves.toEqual({ success: false, error: "Artifact not found." });
  });

  it("should count each link the workspace acts on", () => {
    const store = createFixtureStore();
    store.countLink();
    store.countLink();
    expect(store.linksHandled()).toBe(2);
  });
});
