import type { CaptureType, PartBox } from "@/lib/canvas/capture-rules";

import { encodeTypes, encodeWithin, type DrawingPlan, type LeftOutReason, type PartEncoder } from "./capture-host-rules";

/**
 * Draws a capture box and cuts the drawing into parts. The drawing library
 * loads here, on the first drawing, so no page pays for it until a frame is
 * really drawn. Everything is drawn at one image pixel per CSS pixel: a
 * part is sized for a model to read at full size, and nothing is scaled.
 */

/** A drawing ready to upload: every part, in order, all of one type. */
export interface DrawnParts {
  type: CaptureType;
  parts: Blob[];
}

/** What a drawing came to: its parts, or why it is left out of this pass. */
export type DrawOutcome = ({ state: "drawn" } & DrawnParts) | { state: "left-out"; reason: LeftOutReason };

const leftOut = (reason: LeftOutReason): DrawOutcome => ({ state: "left-out", reason });

function encoderOf(canvas: HTMLCanvasElement): PartEncoder<Blob> {
  return (type, quality) =>
    new Promise((resolve) => {
      canvas.toBlob((blob) => { resolve(blob ? { type: blob.type, bytes: blob.size, data: blob } : null); }, type, quality);
    });
}

/** One part of the drawing as its own canvas, exactly the part's size. Null when the browser gives no canvas. */
function cutPart(drawing: HTMLCanvasElement, box: PartBox, background: string): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // The page color first: a JPEG has no transparency, and the last row of a drawing may be a fraction of a pixel short.
  context.fillStyle = background;
  context.fillRect(0, 0, box.width, box.height);
  context.drawImage(drawing, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return canvas;
}

/** Every part as `type`, or why not: the browser cannot write the type, a part cannot be made small enough, or the browser gave no canvas or no picture. */
async function encodeParts(drawing: HTMLCanvasElement, plan: DrawingPlan, background: string, type: CaptureType): Promise<Blob[] | "wrong-type" | "too-large" | "failed"> {
  const parts: Blob[] = [];
  for (const box of plan.parts) {
    const canvas = cutPart(drawing, box, background);
    if (!canvas) return "failed";
    const outcome = await encodeWithin(encoderOf(canvas), type);
    if (outcome.state !== "fits") return outcome.state;
    parts.push(outcome.part.data);
  }
  return parts;
}

/**
 * Draws `element` (the capture box, `width` CSS pixels wide and
 * `plan.drawnHeight` tall) and returns its parts, as WebP, or as JPEG where
 * the browser cannot write WebP. Otherwise it says why the host leaves this
 * drawing out: the drawing did not come out at the box's size, a part
 * cannot be made small enough, the browser gave no picture (which is not a
 * matter of type, so JPEG is not tried), or the browser writes neither
 * type. Throws when the library fails; the caller catches it.
 */
export async function drawParts(element: HTMLElement, width: number, plan: DrawingPlan): Promise<DrawOutcome> {
  const { snapdom } = await import("@zumer/snapdom");
  const drawing = await snapdom.toCanvas(element, { scale: 1, dpr: 1, embedFonts: true, placeholders: false });
  if (Math.abs(drawing.width - width) > 1 || Math.abs(drawing.height - plan.drawnHeight) > 1) return leftOut("wrong-size");
  const background = getComputedStyle(element).backgroundColor;
  for (const type of encodeTypes) {
    const parts = await encodeParts(drawing, plan, background, type);
    if (parts === "too-large") return leftOut("too-large");
    if (parts === "failed") return leftOut("encode-failed");
    if (parts !== "wrong-type") return { state: "drawn", type, parts };
  }
  return leftOut("no-type");
}
