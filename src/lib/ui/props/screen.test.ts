import { describe, expect, it } from "vitest";

import { tablerIconEntries } from "@/lib/artifact-icons";
import { blockHues } from "@/lib/block-colors/block-color-rules";

import { containerComponents, uiCatalog } from "../catalog";
import { brandMarksSpec } from "../fixtures/brand-marks";
import { landingPageSpec, styledBlocksSpec, surfaceMatrixSpecs } from "../fixtures/screen";
import { uiLimits } from "../limits";
import { brandMarkLabels, brandUiIconNames, extraUiIconNames, plainUiIconNames, uiIconNames } from "../icon-names";
import { validateUiSpec } from "../validate";

import { boxSurfaces } from "./screen";

function spec(type: string, props: Record<string, unknown>) {
  return { version: 1, root: "e", elements: { e: { type, props } } };
}

function messages(type: string, props: Record<string, unknown>) {
  return validateUiSpec(spec(type, props)).issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
}

describe("Box props", () => {
  it("should accept a Box with no props when it only groups its children", () => {
    expect(messages("Box", {})).toEqual([]);
  });

  it("should show its children when it is a container in the catalog", () => {
    expect(containerComponents.has("Box")).toBe(true);
    expect(uiCatalog.data.components.Box.slots).toEqual(["default"]);
  });

  it("should offer every block hue as a surface when painting a Box", () => {
    for (const hue of blockHues) expect(boxSurfaces).toContain(hue);
    for (const surface of boxSurfaces) expect(messages("Box", { surface })).toEqual([]);
  });

  it.each([
    ["a CSS color", { surface: "#ff0000" }],
    ["a pixel padding", { padding: "12px" }],
    ["a number for the gap", { gap: 4 }],
    ["a class name as the width", { width: "w-1/2" }],
  ])("should refuse %s when a Box is given free-form style", (_name, props) => {
    expect(messages("Box", props)).toHaveLength(1);
  });

  it("should say to set the direction when stackBelow sits on a vertical Box", () => {
    expect(messages("Box", { stackBelow: "md" }).join("\n")).toContain('`stackBelow` only applies to a Box with `direction: "horizontal"`');
    expect(messages("Box", { direction: "horizontal", stackBelow: "md" })).toEqual([]);
  });

  it("should name both props when hideBelow and hideAbove leave no width to show at", () => {
    expect(messages("Box", { hideBelow: "md", hideAbove: "md" }).join("\n")).toContain("hides the Box at every width");
    expect(messages("Box", { hideBelow: "lg", hideAbove: "sm" }).join("\n")).toContain("hides the Box at every width");
    expect(messages("Box", { hideBelow: "sm", hideAbove: "lg" })).toEqual([]);
  });

  it("should report the cross-field problems together with the enum problems when a Box has both", () => {
    const found = messages("Box", { stackBelow: "md", hideBelow: "lg", hideAbove: "sm", padding: "12px", surface: "#ff0000" });
    const all = found.join("\n");
    expect(all).toContain("padding");
    expect(all).toContain("surface");
    expect(all).toContain("`stackBelow` only applies to a Box with `direction: \"horizontal\"`");
    expect(all).toContain("hides the Box at every width");
    expect(found).toHaveLength(4);
  });

  it("should leave a rule out when one of the props it reads is itself invalid or an expression", () => {
    // The direction's own error covers it: the rule cannot tell what the direction will be.
    const invalid = messages("Box", { direction: "row", stackBelow: "md", overflow: "scroll" });
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain("direction");
    expect(messages("Box", { direction: { $state: "/dir" }, stackBelow: "md" })).toEqual([]);
    expect(messages("Box", { hideBelow: "huge", hideAbove: "sm" })).toHaveLength(1);
  });

  it("should explain what a scrolling row needs when overflow is scroll", () => {
    expect(messages("Box", { overflow: "scroll" }).join("\n")).toContain('Set `direction: "horizontal"`');
    expect(messages("Box", { overflow: "scroll", direction: "horizontal", wrap: true }).join("\n")).toContain("a row that wraps never scrolls");
    expect(messages("Box", { overflow: "scroll", direction: "horizontal" })).toEqual([]);
  });
});

describe("Icon props", () => {
  it("should list every page icon, screen mark, and brand mark once when naming icons", () => {
    expect(new Set(uiIconNames).size).toBe(uiIconNames.length);
    expect(uiIconNames).toHaveLength(tablerIconEntries.length + extraUiIconNames.length + brandUiIconNames.length);
    for (const name of ["check", "star", "x", "arrow-right", "menu-2"]) expect(uiIconNames).toContain(name);
  });

  it("should start every brand mark with brand- when naming it, so none clashes with a plain icon", () => {
    for (const name of brandUiIconNames) expect(name.startsWith("brand-")).toBe(true);
    for (const name of plainUiIconNames) expect(name.startsWith("brand-")).toBe(false);
  });

  it("should accept a brand mark on an Icon, a Button, a Badge, and a Link when it names a listed brand", () => {
    expect(messages("Icon", { name: "brand-github", label: "GitHub" })).toEqual([]);
    expect(messages("Button", { label: "GitHub", icon: "brand-github", iconOnly: true })).toEqual([]);
    expect(messages("Badge", { label: "Google", icon: "brand-google" })).toEqual([]);
    expect(messages("Link", { label: "LinkedIn", icon: "brand-linkedin" })).toEqual([]);
  });

  it("should refuse a bare brand name when the mark needs its brand- prefix", () => {
    expect(messages("Icon", { name: "github" }).join("\n")).toContain("Use an icon name from the Icon component's list");
  });

  it("should leave out brands of document and workspace tools when listing names", () => {
    for (const left of ["notion", "confluence", "coda", "google-docs", "dropbox", "slack", "figma"]) {
      expect(uiIconNames).not.toContain(`brand-${left}`);
    }
  });

  it("should point to the icon list when the name is unknown", () => {
    expect(messages("Icon", { name: "unicorn" }).join("\n")).toContain("Use an icon name from the Icon component's list");
  });

  it("should list the icon names in the description an agent reads", () => {
    expect(uiCatalog.data.components.Icon.description).toContain("arrow-right");
    expect(uiCatalog.data.components.Icon.description).toContain("shield-check");
  });

  it("should group the brand marks after the plain icons in the description an agent reads", () => {
    const description = uiCatalog.data.components.Icon.description;
    for (const name of brandUiIconNames) expect(description).toContain(name);
    expect(description.indexOf("brand-github")).toBeGreaterThan(description.indexOf("shield-check"));
  });

  it("should accept an icon name read from a repeated item when the prop is an expression", () => {
    const repeated = {
      version: 1,
      root: "list",
      state: { features: [{ id: "a", icon: "bolt", title: "Fast" }, { id: "b", icon: "lock", title: "Private" }] },
      elements: {
        list: { type: "Box", props: { gap: "sm" }, repeat: { statePath: "/features", key: "id" }, children: ["row"] },
        row: { type: "Box", props: { direction: "horizontal", gap: "sm", align: "center" }, children: ["icon", "title"] },
        icon: { type: "Icon", props: { name: { $item: "icon" } } },
        title: { type: "Text", props: { text: { $item: "title" } } },
      },
    };
    expect(validateUiSpec(repeated).issues).toEqual([]);
  });
});

describe("Text, Heading, and Link screen props", () => {
  it("should keep accepting the props from before the screen set when a spec is older", () => {
    expect(messages("Text", { text: "x", tone: "muted", size: "lg" })).toEqual([]);
    expect(messages("Heading", { text: "x", level: 3 })).toEqual([]);
    expect(messages("Link", { label: "x", href: "https://example.com" })).toEqual([]);
  });

  it("should accept a link without an address when it is a mockup menu item", () => {
    expect(messages("Link", { label: "Pricing", variant: "nav", active: true })).toEqual([]);
  });

  it.each(["/pricing", "#top", "javascript:alert(1)", "pricing"])("should refuse the address %s and say to leave href out when a link is not absolute", (href) => {
    expect(messages("Link", { label: "x", href }).join("\n")).toContain("leave `href` out");
  });

  it("should refuse a clamp over three lines when cutting text off", () => {
    expect(messages("Text", { text: "x", clamp: 4 })).toHaveLength(1);
    expect(messages("Text", { text: "x", clamp: 3 })).toEqual([]);
  });
});

describe("screen fixtures", () => {
  it.each([["the first surfaces with every tone", surfaceMatrixSpecs[0]], ["the other surfaces with every tone", surfaceMatrixSpecs[1]], ["the landing page", landingPageSpec], ["every styled block", styledBlocksSpec], ["every brand mark", brandMarksSpec]])("should validate %s with no errors or warnings", (_name, fixture) => {
    expect(validateUiSpec(fixture).issues).toEqual([]);
  });

  it("should draw every brand mark at every size with a label when the gallery shows them", () => {
    const icons = Object.values(brandMarksSpec.elements).filter((element) => element.type === "Icon");
    expect(icons).toHaveLength(brandUiIconNames.length * 5);
    expect(new Set(icons.map((icon) => icon.props?.label))).toEqual(new Set(Object.values(brandMarkLabels)));
    expect(new Set(icons.map((icon) => icon.props?.size))).toEqual(new Set(["xs", "sm", "md", "lg", "xl"]));
  });

  it("should put every surface in the matrix, once, when the contrast scan reads it", () => {
    const boxes = surfaceMatrixSpecs.flatMap((spec) => Object.keys(spec.elements).filter((key) => key.endsWith("-box")));
    expect(boxes.toSorted()).toEqual(boxSurfaces.map((surface) => `${surface}-box`).toSorted());
  });

  it("should keep each surface spec well under the element limit when the matrix is drawn", () => {
    // A quarter of the limit stays free, so a new piece on every surface, or a new surface, never breaks the specimen.
    for (const spec of surfaceMatrixSpecs) expect(Object.keys(spec.elements).length).toBeLessThanOrEqual(uiLimits.maxElements * 0.75);
  });
});
