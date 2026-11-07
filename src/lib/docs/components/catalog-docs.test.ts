import { describe, expect, it } from "vitest";

import { uiComponentNames } from "@/lib/ui/catalog";
import { validateUiSpec } from "@/lib/ui/validate";

import { componentBySlug, componentDocs, componentGroups, componentSlug, orderedComponents } from "./catalog-docs";

describe("component docs", () => {
  it("should have a docs entry with at least one example when a component is in the catalog", () => {
    for (const name of uiComponentNames) {
      expect(componentDocs[name].examples.length, name).toBeGreaterThan(0);
    }
  });

  it("should put every catalog component in exactly one group when grouping by props module", () => {
    expect([...orderedComponents].sort()).toEqual([...uiComponentNames].sort());
    expect(componentGroups.flatMap((group) => group.components)).toHaveLength(uiComponentNames.length);
  });

  it("should round-trip every component through its slug when building URLs", () => {
    for (const name of uiComponentNames) expect(componentBySlug(componentSlug(name))).toBe(name);
  });

  it("should validate every example with no errors or warnings when checked like a saved artifact", () => {
    for (const name of uiComponentNames) {
      for (const example of componentDocs[name].examples) {
        const result = validateUiSpec(JSON.stringify(example.spec));
        expect(result.issues, `${name}: ${example.title}`).toEqual([]);
      }
    }
  });

  it("should use the component itself in at least one example when documenting it", () => {
    for (const name of uiComponentNames) {
      const used = componentDocs[name].examples.some((example) => Object.values(example.spec.elements).some((element) => element.type === name));
      expect(used, name).toBe(true);
    }
  });
});
