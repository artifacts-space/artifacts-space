import { describe, expect, it } from "vitest";

import { fixtureArtifact } from "@/components/dev/fixture-content";
import { toArtifactListItem } from "@/lib/artifact-preview";

import { filteredProjectName, upsertListItem, withoutDeleted, withRefreshed, withSaved, withStoredArtifacts } from "./use-new-artifact";

const note = (id: string, title: string) => fixtureArtifact({ id, kind: "markdown", title, content: "x" });

describe("upsertListItem", () => {
  it("should add a new artifact first when the list does not have it yet", () => {
    const list = [toArtifactListItem(note("a", "Old"))];
    expect(upsertListItem(list, note("b", "New")).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("should replace the artifact in place when the list already has it", () => {
    const list = [toArtifactListItem(note("a", "One")), toArtifactListItem(note("b", "Two"))];
    const next = upsertListItem(list, note("b", "Two, renamed"));
    expect(next.map((item) => item.title)).toEqual(["One", "Two, renamed"]);
  });
});

describe("filteredProjectName", () => {
  const facets = { projects: [{ key: "launch", name: "Launch", icon: null, count: 2 }], none: 1, total: 3 };

  it("should name the project the list is filtered to", () => {
    expect(filteredProjectName({ key: "launch" }, facets)).toBe("Launch");
  });

  it("should give no project when the list is unfiltered, shows no project, or names an unknown key", () => {
    expect(filteredProjectName(null, facets)).toBeNull();
    expect(filteredProjectName({ none: true }, facets)).toBeNull();
    expect(filteredProjectName({ key: "gone" }, facets)).toBeNull();
  });
});

describe("withStoredArtifacts", () => {
  it("should hand back the same array when no blank page became an artifact", () => {
    const initial = [note("a", "One")];
    expect(withStoredArtifacts(initial, [])).toBe(initial);
  });

  it("should add the stored artifacts after the pane's own when blank pages became some", () => {
    expect(withStoredArtifacts([note("a", "One")], [note("b", "Two")])?.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("withSaved", () => {
  it("should drop the oldest kept artifact when a sixth is saved", () => {
    const kept = ["a", "b", "c", "d", "e"].map((id) => note(id, id));
    expect(withSaved(kept, note("f", "f"), 5).map((item) => item.id)).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("should move an artifact saved again to the end instead of keeping it twice", () => {
    const kept = [note("a", "One"), note("b", "Two")];
    const next = withSaved(kept, note("a", "One, again"), 5);
    expect(next.map((item) => item.title)).toEqual(["Two", "One, again"]);
  });
});

describe("withRefreshed", () => {
  it("should replace the kept copy when the artifact was saved on its own page", () => {
    const kept = [note("a", "Old body")];
    expect(withRefreshed(kept, note("a", "New body"))[0]?.title).toBe("New body");
  });

  it("should hand back the same array when the artifact is not kept", () => {
    const kept = [note("a", "One")];
    expect(withRefreshed(kept, note("b", "Two"))).toBe(kept);
  });
});

describe("withoutDeleted", () => {
  it("should drop a deleted artifact's kept copy", () => {
    expect(withoutDeleted([note("a", "One"), note("b", "Two")], "a").map((item) => item.id)).toEqual(["b"]);
  });

  it("should hand back the same array when the deleted artifact was not kept", () => {
    const kept = [note("a", "One")];
    expect(withoutDeleted(kept, "b")).toBe(kept);
  });
});
