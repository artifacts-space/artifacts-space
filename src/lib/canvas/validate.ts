import { hasErrors } from "@/lib/ui/issues";
import { validateUiSpec } from "@/lib/ui/validate";

import { inFrame, type CanvasIssue } from "./issues";
import { readCanvas, type CanvasFrameRead } from "./read";

/** The outcome of validating a canvas. */
export interface CanvasValidationResult {
  /** True when there are no errors. Warnings are allowed. */
  valid: boolean;
  /** True when the board can be drawn, possibly with some frames showing a notice. */
  renderable: boolean;
  /** Every frame that could be read, with stand-in values where a field was unusable. */
  frames: CanvasFrameRead[];
  /** Every issue, board first, then frame by frame in order. */
  issues: CanvasIssue[];
}

function specIssues(frame: CanvasFrameRead): CanvasIssue[] {
  if (!frame.spec) return [];
  return validateUiSpec(frame.spec).issues.map((issue) => inFrame(issue, frame.id, frame.label));
}

/**
 * Validates a canvas artifact: the JSON text (or an already-parsed value),
 * the board's limits and version, each frame's fields, and each frame's ui
 * spec with the same checks and limits as a ui artifact. Issues name the
 * frame, then the element, and say how to fix the problem.
 */
export function validateCanvas(input: unknown): CanvasValidationResult {
  const read = readCanvas(input);
  const issues = [...read.issues, ...read.frames.flatMap((frame) => [...frame.issues, ...specIssues(frame)])];
  return { valid: !hasErrors(issues), renderable: read.renderable, frames: read.frames, issues };
}
