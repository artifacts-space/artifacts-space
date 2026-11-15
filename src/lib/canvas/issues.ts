import { specError, specWarning, type UiSpecIssue } from "@/lib/ui/issues";

/** One problem found in a canvas. A problem inside a frame names the frame, and the element when it belongs to one. */
export interface CanvasIssue extends UiSpecIssue {
  /** The id of the frame the issue belongs to, when it belongs to one. */
  frameId?: string;
}

/** Issue codes that stop the whole canvas from being drawn. A problem inside one frame never does. */
export const blockingCanvasCodes: ReadonlySet<string> = new Set([
  "invalid_json",
  "too_large",
  "not_object",
  "unsupported_version",
  "invalid_frames",
  "too_many_frames",
  "too_many_elements",
]);

/** An error about the canvas as a whole. */
export function canvasError(code: string, message: string): CanvasIssue {
  return specError(code, message);
}

/** A warning about the canvas as a whole. */
export function canvasWarning(code: string, message: string): CanvasIssue {
  return specWarning(code, message);
}

/** How messages name a frame: by its id, or by its place when it has no usable id. */
export function frameLabel(id: string | null, index: number): string {
  return id === null ? `Frame ${String(index + 1)}` : `Frame "${id}"`;
}

/** An error inside one frame. The message starts with the frame's label. */
export function frameError(code: string, frameId: string, label: string, message: string): CanvasIssue {
  return { severity: "error", code, message: `${label}: ${message}`, frameId };
}

/** A warning inside one frame. The message starts with the frame's label. */
export function frameWarning(code: string, frameId: string, label: string, message: string): CanvasIssue {
  return { severity: "warning", code, message: `${label}: ${message}`, frameId };
}

/** A ui issue from a frame's spec, as a canvas issue that names the frame first. */
export function inFrame(issue: UiSpecIssue, frameId: string, label: string): CanvasIssue {
  return { ...issue, message: `${label}: ${issue.message}`, frameId };
}

/** True when an issue stops the canvas from being drawn at all. */
export function isBlockingCanvasIssue(issue: CanvasIssue): boolean {
  return issue.severity === "error" && issue.frameId === undefined && blockingCanvasCodes.has(issue.code);
}
