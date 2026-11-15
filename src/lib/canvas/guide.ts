import { uiLimits } from "@/lib/ui/limits";

import { exampleCanvas } from "./fixtures";
import { canvasLimits, frameSizes } from "./limits";
import { CANVAS_VERSION } from "./version";

const number = (value: number) => value.toLocaleString("en-US");

const rules = [
  `Submit ONE JSON object as the artifact content (not JSONL, not Markdown, no code fences): { "version": ${String(CANVAS_VERSION)}, "frames": [{ "id", "name", "width", "height", "padding", "x", "y", "spec" }] }. Always set "version": ${String(CANVAS_VERSION)}.`,
  'A frame is one screen: a page of a website or a screen of an app. Its `spec` is a complete ui spec ({ "version", "root", "elements", "state" }), drawn with the same components as a ui artifact. Call artifacts_formats_guide with kind "ui" for the component reference and its rules; they all apply inside a frame.',
  "No HTML, CSS, class names, or scripts anywhere. Layout and color come from the components.",
  `\`id\`: a short, unique name for the frame, up to ${String(canvasLimits.maxIdLength)} lowercase letters, digits, and hyphens ("checkout-phone"). Keep a frame's id when you change the frame. \`name\`: what people see above the frame, up to ${String(canvasLimits.maxNameLength)} characters ("Checkout, phone").`,
  `\`width\`: the frame's width in CSS pixels, a whole number from ${String(canvasLimits.minWidth)} to ${number(canvasLimits.maxWidth)}. Usual sizes: ${String(frameSizes.desktop)} (desktop), ${String(frameSizes.tablet)} (tablet), ${String(frameSizes.phone)} (phone). To show one screen at several sizes, add one frame per size and lay each out for its width (for example, fewer Grid columns on the phone frame).`,
  `\`height\` is optional. Leave it out and the frame is as tall as its content. Set it (${String(canvasLimits.minHeight)} to ${number(canvasLimits.maxHeight)}) and the frame is at least that tall, such as 844 for a phone screen; longer content makes the frame taller and is never cut off.`,
  '`padding` is optional: "none", "sm", "md" (the default), or "lg". It is the space between the frame\'s edge and its content. Use "none" when the content should reach the edges.',
  `\`x\` and \`y\` are optional. Leave both out and frames sit in one row, left to right in the order you list them, ${String(canvasLimits.autoGap)} pixels apart: list the screens of a flow in the order a person meets them. To arrange rows yourself, set both on a frame (whole numbers, the frame's top-left corner; y grows downward).`,
  "Each frame keeps its own state: an input in one frame never changes another frame.",
  "Image and File elements work as in a ui artifact: upload first, then put the file id in `file`. Saving the canvas attaches the files it names.",
  `Limits: ${String(canvasLimits.maxFrames)} frames, ${number(canvasLimits.maxElements)} elements across all frames, and ${number(canvasLimits.maxCanvasBytes)} bytes in all. Each frame's spec also keeps the ui limits (${number(uiLimits.maxSpecBytes)} bytes, ${String(uiLimits.maxElements)} elements).`,
  'Call artifacts_validate with kind "canvas" before saving to see every problem at once. Each issue names the frame, then the element, and says how to fix it. A frame with a problem shows a notice in its place; the other frames still render.',
];

/**
 * The guide agents read before writing a canvas artifact: the board's rules
 * and one compact example. It points at the ui guide for the components.
 */
export function buildCanvasGuide(): string {
  return [
    `# canvas artifacts (format version ${String(CANVAS_VERSION)})`,
    "A canvas is a board of frames for mocking up websites and app screens. People pan and zoom the board, and each frame is drawn at its real width with the artifacts.space component set.",
    "## Rules",
    rules.map((rule, index) => `${String(index + 1)}. ${rule}`).join("\n"),
    "## Example",
    JSON.stringify(exampleCanvas, null, 2),
  ].join("\n\n");
}
