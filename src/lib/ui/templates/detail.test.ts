import { describe, expect, it } from "vitest";

import { validateUiSpec } from "../validate";

import { templateDetail } from "./detail";
import { uiTemplates } from "./index";
import { attachFragment } from "./instantiate";
import { TemplateError } from "./types";

describe("templateDetail", () => {
  it("should return a fragment under the template's id when no prefix or form is given", () => {
    const detail = templateDetail("pricing-three-tiers");
    expect(detail.prefix).toBe("pricing-three-tiers");
    expect(detail.fragment?.root).toBe("pricing-three-tiers-pricing");
    expect(Object.keys(detail.fragment?.state ?? {})).toEqual(["pricing-three-tiers"]);
    expect(detail.spec).toBeUndefined();
    expect(detail.attach).toMatch(/put "pricing-three-tiers-pricing" in the `children` of a Box/);
    expect(detail.attach).toMatch(/add `fragment\.state`'s one key \("pricing-three-tiers"\)/);
  });

  it("should count the template's facts and point its slots at prefixed keys when a prefix is given", () => {
    const detail = templateDetail("pricing-three-tiers", { prefix: "plans" });
    expect(detail).toMatchObject({ id: "pricing-three-tiers", category: "pricing", kind: "marketing", viewport: "fluid", surface: "page", interactive: true, prefix: "plans" });
    expect(detail.elements).toBe(Object.keys(detail.fragment?.elements ?? {}).length);
    expect(detail.components).toContain("Switch");
    expect(detail.slots).toContainEqual({ what: "Headline", element: "plans-title", prop: "text" });
    expect(detail.slots.some((slot) => "state" in slot && slot.state === "/plans/plans")).toBe(true);
  });

  it("should not mention state in the attach note when the template has none", () => {
    expect(templateDetail("hero-centered").attach).not.toMatch(/fragment\.state/);
    expect(templateDetail("hero-centered").interactive).toBe(false);
  });

  it("should return a complete, valid spec when asked for one", () => {
    const detail = templateDetail("hero-centered", { as: "spec" });
    expect(detail.fragment).toBeUndefined();
    expect(detail.attach).toMatch(/canvas_frame_save/);
    expect(validateUiSpec(detail.spec).issues).toEqual([]);
  });

  it("should give a fragment that attaches to another template's spec, for every template", () => {
    for (const template of uiTemplates) {
      const host = templateDetail("hero-centered", { as: "spec", prefix: "host" }).spec;
      const fragment = templateDetail(template.id).fragment;
      if (!host || !fragment) throw new Error("missing");
      expect(validateUiSpec(attachFragment(host, fragment, { parent: "page" })).issues, template.id).toEqual([]);
    }
  });

  it("should refuse an id no template has, and a prefix that is not usable", () => {
    expect(() => templateDetail("hero-missing")).toThrow(/No template has the id "hero-missing"\. Call ui_templates_list/);
    expect(() => templateDetail("hero-centered", { prefix: "Bad Prefix" })).toThrow(TemplateError);
  });
});
