import { describe, expect, it } from "vitest";

import { uiRegistry } from "@/components/artifact-view/ui/registry";
import { formatKinds } from "@/lib/artifact-formats";
import { chartTypes } from "@/lib/ui/props/chart";
import { validateUiSpec } from "@/lib/ui/validate";

import { previewComponentNames, previewFormats, previewGroupIds, previewGroups } from "./catalog";
import { checkoutRolloutSpec } from "./samples";

const groups = previewGroups();

describe("previewGroups", () => {
  it("should list every registry component exactly once when building the page", () => {
    const shown = previewComponentNames(groups);
    expect([...shown].sort()).toEqual(Object.keys(uiRegistry).sort());
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("should list every artifact format when building the page", () => {
    expect(previewFormats(groups)).toEqual([...formatKinds]);
  });

  it("should keep the six sections in page order when building the page", () => {
    expect(groups.map((group) => group.id)).toEqual([...previewGroupIds]);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
  });

  it("should give every item a unique anchor id when building the page", () => {
    const ids = [...groups.map((group) => group.id), ...groups.flatMap((group) => group.items.map((item) => item.id))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should show at least one example for every component when building the page", () => {
    for (const item of groups.flatMap((group) => group.items)) {
      if (item.type === "component") expect(item.examples.length, item.name).toBeGreaterThan(0);
    }
  });

  it("should show every chart kind when building the page", () => {
    const chart = groups.flatMap((group) => group.items).find((item) => item.type === "component" && item.name === "Chart");
    const elements = chart?.type === "component" ? chart.examples.flatMap((example) => Object.values(example.spec.elements)) : [];
    const kinds = elements.filter((element) => element.type === "Chart").map((element) => element.props?.type);
    expect(new Set(kinds)).toEqual(new Set(chartTypes));
  });

  it("should validate every preview spec with no issues when checked like a saved artifact", () => {
    const specs = groups.flatMap((group) => group.items.flatMap((item) => (item.type === "component" ? item.examples : [])));
    for (const example of specs) {
      expect(validateUiSpec(JSON.stringify(example.spec)).issues, example.title).toEqual([]);
    }
    expect(validateUiSpec(JSON.stringify(checkoutRolloutSpec)).issues).toEqual([]);
  });
});
