import { describe, expect, it } from "vitest";

import { exampleCanvas } from "./fixtures";
import { buildCanvasGuide } from "./guide";
import { canvasLimits } from "./limits";
import { canvasExcerpt, canvasOutline } from "./outline";
import { validateCanvas } from "./validate";

describe("buildCanvasGuide", () => {
  const guide = buildCanvasGuide();

  it("should show an example that passes validation with no issues", () => {
    const example = guide.slice(guide.indexOf("## Example") + "## Example".length).trim();
    expect(JSON.parse(example)).toEqual(exampleCanvas);
    expect(validateCanvas(example).issues).toEqual([]);
  });

  it("should state the limits and the usual frame sizes from the code", () => {
    expect(guide).toContain(`${String(canvasLimits.maxFrames)} frames`);
    expect(guide).toContain("3,000 elements across all frames");
    expect(guide).toContain("1440 (desktop), 768 (tablet), 390 (phone)");
  });

  it("should point at the ui guide for components and at validation before saving", () => {
    expect(guide).toContain('artifacts_formats_guide with kind "ui"');
    expect(guide).toContain('artifacts_validate with kind "canvas"');
    expect(guide).toContain("No HTML, CSS, class names, or scripts");
  });
});

describe("canvasOutline", () => {
  it("should list the frames in order when the canvas can be read", () => {
    expect(canvasOutline(JSON.stringify(exampleCanvas))).toEqual([
      { name: "Sign in, phone", width: 390, height: null },
      { name: "Sign in, desktop", width: 1440, height: null },
    ]);
  });

  it("should return null when the canvas cannot be read", () => {
    expect(canvasOutline("{ nope")).toBeNull();
  });

  it("should describe the canvas by its frame names, or say nothing when it has none", () => {
    expect(canvasExcerpt(JSON.stringify(exampleCanvas))).toBe("2 frames: Sign in, phone; Sign in, desktop");
    expect(canvasExcerpt('{"version":1,"frames":[]}')).toBe("");
    expect(canvasExcerpt("nope")).toBe("");
  });
});
