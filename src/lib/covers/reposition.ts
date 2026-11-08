/**
 * Moving an image cover's focal point: by keyboard in steps, or by dragging.
 * Pure, so the rules are tested without a browser.
 */

const clampPosition = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/**
 * The focal point after a key press, or null for keys reposition does not
 * handle. Up and Down move 1 point (10 with Shift); Page Up and Page Down
 * move 10; Home and End go to the top and bottom.
 */
export function positionAfterKey(position: number, key: string, shift: boolean): number | null {
  const step = shift ? 10 : 1;
  switch (key) {
    case "ArrowUp":
      return clampPosition(position - step);
    case "ArrowDown":
      return clampPosition(position + step);
    case "PageUp":
      return clampPosition(position - 10);
    case "PageDown":
      return clampPosition(position + 10);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

/** The sizes a drag needs: the banner, and the image's natural size. */
export interface DragFrame {
  frameWidth: number;
  frameHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * The focal point after dragging the image `deltaY` pixels (down is
 * positive). The image follows the pointer: dragging down shows more of the
 * top. When the image is no taller than the banner nothing can move.
 */
export function positionAfterDrag(start: number, deltaY: number, frame: DragFrame): number {
  if (frame.naturalWidth <= 0 || frame.frameWidth <= 0) return clampPosition(start);
  const renderedHeight = Math.max(frame.frameHeight, (frame.frameWidth * frame.naturalHeight) / frame.naturalWidth);
  const overflow = renderedHeight - frame.frameHeight;
  if (overflow < 1) return clampPosition(start);
  return clampPosition(start - (deltaY / overflow) * 100);
}
