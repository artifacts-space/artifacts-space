import { describe, expect, it } from "vitest";

import { fixtureArtifact } from "@/components/dev/fixture-content";
import { toArtifactListItem } from "@/lib/artifact-preview";

import { filteredProjectName, upsertListItem, withStoredArtifacts } from "./use-new-artifact";

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
