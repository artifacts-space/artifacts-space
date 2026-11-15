/**
 * Hard limits for canvas artifacts. Each frame's spec also keeps the ui
 * limits (`uiLimits`): these bound the board around them.
 */
export const canvasLimits = {
  /**
   * Largest canvas, in UTF-8 bytes of its JSON text. A byte is at least one
   * character, so this always fits the 1,000,000 character content cap.
   */
  maxCanvasBytes: 800_000,
  /** Most frames on one canvas: room for a long flow at three sizes, and still a board a reader can take in. */
  maxFrames: 24,
  /** Most elements across all frames, so a full board stays quick to draw. One frame may still use up to the ui limit. */
  maxElements: 3_000,
  /** Narrowest and widest frame, in CSS pixels. */
  minWidth: 240,
  maxWidth: 2_560,
  /** Shortest and tallest `height` a frame may ask for, in CSS pixels. */
  minHeight: 120,
  maxHeight: 10_000,
  /** Largest distance of a frame's corner from the board's origin, on either axis. */
  maxCoordinate: 100_000,
  /** Longest frame name and id. */
  maxNameLength: 80,
  maxIdLength: 40,
  /** Space between frames that are placed automatically. */
  autoGap: 80,
} as const;

/** The usual frame widths, named in the guide and the docs. */
export const frameSizes = { desktop: 1440, tablet: 768, phone: 390 } as const;

/** How much space a frame keeps between its edge and its content. */
export const framePaddings = ["none", "sm", "md", "lg"] as const;
export type FramePadding = (typeof framePaddings)[number];
