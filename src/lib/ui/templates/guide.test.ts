import { describe, expect, it } from "vitest";

import { buildCanvasGuide } from "@/lib/canvas/guide";
import { toolAccess } from "@/lib/mcp/tool-access";

import { buildUiGuide } from "../guide";

import { templateGuide, templateGuideHeading } from "./guide";
import { templatePageKey } from "./instantiate";
import { templateCategoryNames } from "./types";

describe("templateGuide", () => {
  it.each(["ui", "canvas"] as const)("should name both template tools, which the server has, in the %s passage", (target) => {
    const passage = templateGuide(target);
    const named = new Set(passage.match(/\b(?:ui|canvas|artifacts)_[a-z_]+\b/g));
    expect([...named]).toEqual(expect.arrayContaining(["ui_templates_list", "ui_template_get"]));
    for (const name of named) expect(Object.keys(toolAccess), name).toContain(name);
  });

  it("should list every category and name the page Box the spec form is wrapped in", () => {
    const passage = templateGuide("ui");
    for (const category of templateCategoryNames) expect(passage, category).toContain(category);
    expect(passage).toContain(`"${templatePageKey}"`);
  });

  it("should be part of the ui guide, before the components, and of the canvas guide, before the example", () => {
    const ui = buildUiGuide();
    expect(ui).toContain(templateGuide("ui"));
    expect(ui.indexOf(templateGuideHeading)).toBeLessThan(ui.indexOf("## Components"));
    const canvas = buildCanvasGuide();
    expect(canvas).toContain(templateGuide("canvas"));
    expect(canvas.indexOf(templateGuideHeading)).toBeLessThan(canvas.indexOf("## Example"));
  });
});
